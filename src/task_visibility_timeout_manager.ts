import { ChangeMessageVisibilityBatchCommand, SQSClient } from "@aws-sdk/client-sqs"
import { EventDispatcher } from "./event_dispatcher"
import { Task } from "./task"
import { TaskStorage } from "./task_storage"
import { constructMessageVisibilityBatchRequest, sleep, splitEvery } from "./utils"

export class TaskVisibilityTimeoutManager extends EventDispatcher {
    private sqs: SQSClient
    private task?: Promise<void>
    private storage: TaskStorage
    private queueUrl: string
    private running: boolean
    private heartbeatInterval: number

    constructor(sqs: SQSClient, queueUrl: string, storage: TaskStorage, heartbeatInterval: number) {
        super()
        this.sqs = sqs
        this.queueUrl = queueUrl
        this.storage = storage
        this.heartbeatInterval = heartbeatInterval
        this.running = true
    }

    public start(): void {
        this.running = true
        this.task = this.runInfiniteLoop()
    }

    public stop(): void {
        this.running = false
    }

    public async waitForStop(): Promise<void> {
        if (this.task) {
            await this.task
        }
    }

    private async runInfiniteLoop(): Promise<void> {
        while (this.running) {
            await this.storage.isNotEmpty.wait()

            if (!this.running) {
                return
            }

            await sleep(this.heartbeatInterval * 1000)

            try {
                const tasks = this.storage.getProcessingTasks()
                const chunks: Task[][] = splitEvery(tasks, 10)

                for (const chunk of chunks) {
                    await this.sqs.send(
                        new ChangeMessageVisibilityBatchCommand({
                            QueueUrl: this.queueUrl,
                            Entries: constructMessageVisibilityBatchRequest(chunk),
                        }),
                    )
                }
            } catch (e) {
                this.dispatch("error", e)
            }
        }
    }
}
