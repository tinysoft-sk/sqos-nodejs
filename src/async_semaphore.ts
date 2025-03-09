export class AsyncSemaphore {
    private _isOpen: boolean
    private _waiters: ((value: void) => void)[]

    constructor() {
        this._isOpen = false
        this._waiters = []
    }

    /**
     * Opens the semaphore and wakes all waiting promises.
     */
    open() {
        if (!this._isOpen) {
            this._isOpen = true
            this._waiters.forEach((resolve) => resolve())
            this._waiters = []
        }
    }

    /**
     * Closes the semaphore.
     */
    close() {
        this._isOpen = false
    }

    /**
     * Returns a promise that resolves when the semaphore is open.
     * If the semaphore is already open, the promise resolves immediately.
     */
    async wait(): Promise<void> {
        if (this._isOpen) {
            return Promise.resolve()
        }
        return new Promise((resolve) => {
            this._waiters.push(resolve)
        })
    }
}
