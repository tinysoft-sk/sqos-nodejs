import { DeleteMessageCommand, ChangeMessageVisibilityCommand, SQSClient } from "@aws-sdk/client-sqs"
import { EventDispatcher } from "./event_dispatcher"
import { Task } from "./task"
import { TaskDownloader } from "./task_downloader"
import { TaskProcessor } from "./task_processor"
import { TaskStorage } from "./task_storage"
import { TaskVisibilityTimeoutManager } from "./task_visibility_timeout_manager"

export type OnFailureBehaviour = "delete-message" | "delete-group"

export type ConsumerOptions = {
    sqs?: SQSClient
    queueUrl: string
    batchSize?: number
    heartbeatInterval?: number
    pollingWaitTimeMs?: number
    waitTimeSeconds?: number
    onFailureBehaviour?: OnFailureBehaviour
    handler: (payload: unknown) => Promise<void>
}

export class Consumer extends EventDispatcher {
    private sqs: SQSClient
    private queueUrl: string
    private storage: TaskStorage
    private taskDownloader: TaskDownloader
    private taskProcessor: TaskProcessor
    private taskVisibilityTimeoutManager: TaskVisibilityTimeoutManager
    private handler: (payload: unknown) => Promise<void>
    private onFailureBehaviour: OnFailureBehaviour

    constructor({
        sqs = new SQSClient({}),
        batchSize = 10,
        heartbeatInterval = 15,
        pollingWaitTimeMs = 0,
        waitTimeSeconds = 20,
        onFailureBehaviour = "delete-message",
        queueUrl,
        handler,
    }: ConsumerOptions) {
        super()
        this.sqs = sqs
        this.queueUrl = queueUrl
        this.handler = handler
        this.onFailureBehaviour = onFailureBehaviour
        this.storage = new TaskStorage(batchSize)
        this.taskDownloader = new TaskDownloader(
            sqs,
            this.storage,
            queueUrl,
            batchSize,
            pollingWaitTimeMs,
            waitTimeSeconds,
        )
        this.taskVisibilityTimeoutManager = new TaskVisibilityTimeoutManager(
            sqs,
            queueUrl,
            this.storage,
            heartbeatInterval,
        )
        this.taskProcessor = new TaskProcessor(this.storage, this._processMessage.bind(this))

        this.storage.subscribe("status", this._onStorageStatusChange.bind(this))
        this.taskDownloader.subscribe("error", this._onError.bind(this))
        this.taskVisibilityTimeoutManager.subscribe("error", this._onError.bind(this))
    }

    private _onStorageStatusChange(data: unknown): void {
        this.dispatch("status", data)
    }

    private _onError(data: unknown): void {
        this.dispatch("error", data)
    }

    public start(): void {
        this.taskDownloader.start()
        this.taskProcessor.start()
        this.taskVisibilityTimeoutManager.start()

        this.dispatch("started", null)
    }

    public stop(): void {
        this.taskDownloader.stop()
        this.taskProcessor.stop()
        this.taskVisibilityTimeoutManager.stop()

        this.storage.isNotFull.open()
        this.storage.shouldWaitForNext.open()
    }

    public async waitForStop(): Promise<void> {
        await this.taskDownloader.waitForStop()
        await this.taskProcessor.waitForStop()
        await this.taskVisibilityTimeoutManager.waitForStop()

        this.dispatch("stopped", null)
    }

    private async _processMessage(task: Task): Promise<void> {
        try {
            this.dispatch("message_received", task.payload)

            await this.handler(task.payload)
            this.storage.setFinished(task.id)

            this.dispatch("message_processed", task.payload)

            await this.sqs.send(
                new DeleteMessageCommand({
                    QueueUrl: this.queueUrl,
                    ReceiptHandle: task.handle as string,
                }),
            )
        } catch (e) {
            this.storage.setDiscarded(task.id, this.onFailureBehaviour)
            this.dispatch("message_error", [task.payload, e])

            try {
                await this.sqs.send(
                    new ChangeMessageVisibilityCommand({
                        QueueUrl: this.queueUrl,
                        ReceiptHandle: task.handle as string,
                        VisibilityTimeout: 0,
                    }),
                )
            } catch (visibilityError) {
                this.dispatch("error", ["Failed to change visibility timeout", visibilityError])
            }
        }
    }
}
