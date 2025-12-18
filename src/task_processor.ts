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
                if (!this.running) {
                    break
                }
                await this.storage.shouldWaitForNext.wait()
                continue
            }

            this.storage.setProcessing(task.id)
            const handlerPromise = this.handler(task)
            this.activeHandlers.add(handlerPromise)
            void handlerPromise.finally(() => {
                this.activeHandlers.delete(handlerPromise)
            })
        }
        await Promise.allSettled(this.activeHandlers)
    }
}
