import { Message, QueueAttributeName, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs"
import { EventDispatcher } from "./event_dispatcher"
import { Task } from "./task"
import { TaskStorage } from "./task_storage"
import { sleep } from "./utils"

export class TaskDownloader extends EventDispatcher {
    private sqs: SQSClient
    private storage: TaskStorage
    private queueUrl: string
    private batchSize: number
    private running: boolean
    private downloadTask?: Promise<void>
    private pollingWaitTimeMs: number
    private waitTimeSeconds: number

    constructor(
        sqs: SQSClient,
        storage: TaskStorage,
        queueUrl: string,
        batchSize: number,
        pollingWaitTimeMs: number,
        waitTimeSeconds: number,
    ) {
        super()
        this.sqs = sqs
        this.queueUrl = queueUrl
        this.batchSize = batchSize
        this.storage = storage
        this.running = true
        this.pollingWaitTimeMs = pollingWaitTimeMs
        this.waitTimeSeconds = waitTimeSeconds
    }

    start(): void {
        this.running = true
        this.downloadTask = this.runInfiniteLoop()
    }

    stop(): void {
        this.running = false
    }

    async waitForStop(): Promise<void> {
        if (this.downloadTask) {
            await this.downloadTask
        }
    }

    private async runInfiniteLoop(): Promise<void> {
        while (this.running) {
            await this.storage.isNotFull.wait()
            if (!this.running) {
                return
            }

            try {
                const response = await this.sqs.send(
                    new ReceiveMessageCommand({
                        QueueUrl: this.queueUrl,
                        MaxNumberOfMessages: Math.min(this.batchSize, 10),
                        WaitTimeSeconds: this.waitTimeSeconds,
                        AttributeNames: ["MessageGroupId", "SentTimestamp"] as unknown as QueueAttributeName[],
                        MessageAttributeNames: ["All"],
                    }),
                )

                const messages = response.Messages || []
                const tasks = messages.map((msg) => this.createTaskFromSQSMessage(msg))
                this.storage.addTasks(tasks)

                if (this.pollingWaitTimeMs > 0) {
                    await sleep(this.pollingWaitTimeMs)
                }
            } catch (err) {
                this.dispatch("error", err)
                await sleep(15000)
            }
        }
    }

    private createTaskFromSQSMessage(message: Message): Task {
        const messageId = message.MessageAttributes?.id?.StringValue || message.MessageId
        if (!messageId) {
            throw new Error("MessageId missing")
        }

        const receiptHandle = message.ReceiptHandle
        if (!receiptHandle) {
            throw new Error("ReceiptHandle missing")
        }

        return {
            id: messageId,
            handle: receiptHandle,
            groupId: message.Attributes?.MessageGroupId,
            payload: message,
            status: "pending",
            receiveTimestamp: new Date().toISOString(),
        }
    }
}
