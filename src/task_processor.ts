import { EventDispatcher } from "./event_dispatcher"
import { Task } from "./task"
import { TaskStorage } from "./task_storage"

export class TaskProcessor extends EventDispatcher {
    private task?: Promise<void>
    private storage: TaskStorage
    private running: boolean
    private handler: (task: Task) => Promise<void>
    private activeHandlers: Set<Promise<void>> = new Set()

    constructor(storage: TaskStorage, handler: (task: Task) => Promise<void>) {
        super()
        this.storage = storage
        this.handler = handler
        this.running = true
    }

    public start(): void {
        this.running = true
        this.task = this.runInfiniteLoop()
    }

    public stop(): void {
        this.running = false
        // Unblock the runInfiniteLoop if it's waiting for new tasks
        this.storage.shouldWaitForNext.open()
    }

    public async waitForStop(): Promise<void> {
        if (this.task) {
            await this.task
        }
    }

    private async runInfiniteLoop(): Promise<void> {
        while (this.running || !this.storage.isEmpty()) {
            const task = this.storage.getNext()

            if (!task) {
                if (this.running) {
                    await this.storage.shouldWaitForNext.wait()
                } else if (this.activeHandlers.size > 0) {
                    // Stopping, but tasks are still pending behind a group that is
                    // being processed (or the capacity is used up). Wait for any
                    // active handler to finish and re-check, instead of abandoning
                    // the pending tasks to their SQS visibility timeout.
                    await this.waitForAnyActiveHandler()
                } else {
                    // Stopping, nothing is running and nothing can be started, so
                    // nothing can change anymore. Bail out instead of hanging.
                    break
                }
                continue
            }

            this.storage.setProcessing(task.id)
            const handlerPromise = this.handler(task)
            this.activeHandlers.add(handlerPromise)
            // then(cleanup, cleanup) instead of finally(): a rejecting handler must
            // not turn into an unhandled rejection of the cleanup chain.
            const cleanup = () => {
                this.activeHandlers.delete(handlerPromise)
            }
            void handlerPromise.then(cleanup, cleanup)
        }
        await Promise.allSettled(this.activeHandlers)
    }

    private async waitForAnyActiveHandler(): Promise<void> {
        // Handler outcomes are irrelevant here, we only need to know one has settled.
        await Promise.race([...this.activeHandlers].map((p) => p.then(undefined, () => undefined)))
    }
}
