import { EventDispatcher } from "./event_dispatcher"
import { Task } from "./task"
import { TaskStorage } from "./task_storage"

export class TaskProcessor extends EventDispatcher {
    private task?: Promise<void>
    private storage: TaskStorage
    private running: boolean
    private handler: (task: Task) => Promise<void>

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
        this.storage.shouldWaitForNext.open()
    }

    public async waitForStop(): Promise<void> {
        if (this.task) {
            await this.task
        }
    }

    private async runInfiniteLoop(): Promise<void> {
        while (this.running) {
            await this.storage.shouldWaitForNext.wait()
            if (!this.running) {
                return
            }
            const task = this.storage.getNext()
            if (!task) {
                return
            }
            this.storage.setProcessing(task.id)
            void this.handler(task)
        }
    }
}
