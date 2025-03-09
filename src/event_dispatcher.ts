type Handler = (data: any) => void

export class EventDispatcher {
    private _events: Record<string, Handler[]>

    constructor() {
        this._events = {}
    }

    subscribe(eventName: string, handler: Handler): void {
        if (!this._events[eventName]) {
            this._events[eventName] = []
        }
        this._events[eventName].push(handler)
    }

    unsubscribe(eventName: string, handler: Handler): void {
        if (this._events[eventName]) {
            this._events[eventName] = this._events[eventName].filter((h) => h !== handler)
            if (this._events[eventName].length === 0) {
                delete this._events[eventName]
            }
        }
    }

    dispatch(eventName: string, data: any): void {
        if (this._events[eventName]) {
            for (const handler of this._events[eventName]) {
                handler(data)
            }
        }
    }
}
