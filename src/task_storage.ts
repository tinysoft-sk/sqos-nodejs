import { AsyncSemaphore } from "./async_semaphore"
import { EventDispatcher } from "./event_dispatcher"
import { getNextAvailableTask } from "./utils"
import { removeItemsByIdAndGroupIdFromArray } from "./utils"
import { removeItemsByIdFromArray } from "./utils"

interface Task {
    id: string
    status: string
    groupId?: string | null
}

export class TaskStorage extends EventDispatcher {
    private _capacity: number
    private _tasks: Task[] = []

    public shouldWaitForNext: AsyncSemaphore = new AsyncSemaphore()
    public isNotEmpty: AsyncSemaphore = new AsyncSemaphore()
    public isNotFull: AsyncSemaphore = new AsyncSemaphore()

    constructor(capacity: number) {
        super()
        this._capacity = capacity
        this._refreshLocks()
    }

    public addTasks(tasks: Task[]): void {
        this._tasks.push(...tasks)
        this._emitMetrics()
        this._refreshLocks()
    }

    public setProcessing(taskId: string): void {
        const task = this._getTaskById(taskId)
        if (task) {
            task.status = "processing"
        } else {
            console.error("sqos-nodejs: setProcessing(): task not found", taskId)
        }
        this._emitMetrics()
        this._refreshLocks()
    }

    public setFinished(taskId: string): void {
        const task = this._getTaskById(taskId)
        if (task) {
            this._tasks = removeItemsByIdFromArray(this._tasks, task.id)
        } else {
            console.error("sqos-nodejs: setFinished(): task not found", taskId)
        }
        this._emitMetrics()
        this._refreshLocks()
    }

    public setDiscarded(taskId: string, behaviour: "delete-message" | "delete-group"): void {
        const task = this._getTaskById(taskId)
        if (task) {
            if (behaviour === "delete-message") {
                this._tasks = removeItemsByIdFromArray(this._tasks, task.id)
            } else {
                this._tasks = removeItemsByIdAndGroupIdFromArray(this._tasks, task.id, task.groupId)
            }
        } else {
            console.error("sqos-nodejs: setDiscarded(): task not found", taskId)
        }
        this._emitMetrics()
        this._refreshLocks()
    }

    public getNext(): Task | null {
        if (this._tasks.filter((x) => x.status === "processing").length >= this._capacity) {
            return null
        }
        return getNextAvailableTask(this._tasks)
    }

    public getProcessingTasks(): Task[] {
        return this._tasks.filter((item) => item.status === "processing")
    }

    private _getTaskById(taskId: string): Task | null {
        return this._tasks.find((item) => item.id === taskId) || null
    }

    private _refreshLocks(): void {
        if (this._tasks.length >= this._capacity) {
            this.isNotFull.close()
        } else {
            this.isNotFull.open()
        }

        if (this.getNext() === null) {
            this.shouldWaitForNext.close()
        } else {
            this.shouldWaitForNext.open()
        }

        if (this._tasks.length === 0) {
            this.isNotEmpty.close()
        } else {
            this.isNotEmpty.open()
        }
    }

    public isEmpty(): boolean {
        return this._tasks.length === 0
    }

    private _emitMetrics(): void {
        this.dispatch("status", {
            processing: this._tasks.filter((x) => x.status === "processing").length,
            pending: this._tasks.filter((x) => x.status === "pending").length,
        })
    }
}
