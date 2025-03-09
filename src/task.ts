export interface Task {
    id: string
    status: string
    receiveTimestamp?: string
    handle?: string
    payload?: any
    groupId?: string | null
}
