import { ChangeMessageVisibilityBatchCommand, SQSClient } from "@aws-sdk/client-sqs"
import { EventDispatcher } from "./event_dispatcher"
import { Task } from "./task"
import { TaskStorage } from "./task_storage"
import { constructMessageVisibilityBatchRequest, splitEvery } from "./utils"

export class TaskVisibilityTimeoutManager extends EventDispatcher {
    private sqs: SQSClient
    private task?: Promise<void>
    private storage: TaskStorage
    private queueUrl: string
    private running: boolean
    private heartbeatInterval: number
    private visibilityTimeout: number
    private abortController: AbortController

    constructor(
        sqs: SQSClient,
        queueUrl: string,
        storage: TaskStorage,
        heartbeatInterval: number,
        visibilityTimeout: number,
    ) {
        super()
        this.sqs = sqs
        this.queueUrl = queueUrl
        this.storage = storage
        this.heartbeatInterval = heartbeatInterval
        this.visibilityTimeout = visibilityTimeout
        this.running = true
        this.abortController = new AbortController()
    }

    public start(): void {
        this.running = true
        this.abortController = new AbortController()
        this.task = this.runInfiniteLoop()
    }

    public stop(): void {
        this.running = false
        this.abortController.abort()
        this.storage.isNotEmpty.open()
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

            try {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        this.abortController.signal.removeEventListener("abort", onAbort)
                        resolve(undefined)
                    }, this.heartbeatInterval * 1000)

                    const onAbort = () => {
                        clearTimeout(timeout)
                        reject(new Error("Aborted"))
                    }

                    this.abortController.signal.addEventListener("abort", onAbort, { once: true })
                })
            } catch (e) {
                if (this.running) {
                    this.dispatch("error", e)
                }
                return
            }

            try {
                const tasks = this.storage.getProcessingTasks()
                const chunks: Task[][] = splitEvery(tasks, 10)

                for (const chunk of chunks) {
                    await this.sqs.send(
                        new ChangeMessageVisibilityBatchCommand({
                            QueueUrl: this.queueUrl,
                            Entries: constructMessageVisibilityBatchRequest(chunk, this.visibilityTimeout),
                        }),
                    )
                }
            } catch (e) {
                this.dispatch("error", e)
            }
        }
    }
}
