import { Task } from "./task"

export const sleep = async (ms: number): Promise<void> => {
    return await new Promise((resolve) => setTimeout(resolve, ms))
}

export const constructMessageVisibilityBatchRequest = (
    tasks: Task[],
): Array<{
    Id: string
    ReceiptHandle: string
    VisibilityTimeout: number
}> => {
    return tasks.map((x, i) => ({
        Id: `task-${i}-${Date.now()}`,
        ReceiptHandle: x.handle as string,
        VisibilityTimeout: 30,
    }))
}

export const splitEvery = (tasks: Task[], chunkSize: number): Task[][] => {
    return Array.from({ length: Math.ceil(tasks.length / chunkSize) }, (_, i) =>
        tasks.slice(i * chunkSize, (i + 1) * chunkSize),
    )
}

export const removeItemsByIdFromArray = (arr: Task[], itemId: string): Task[] => {
    return arr.filter((item) => item.id !== itemId)
}

export const removeItemsByIdAndGroupIdFromArray = (
    arr: Task[],
    itemId: string,
    itemGroupId?: string | null,
): Task[] => {
    let result = arr.filter((item) => item.id !== itemId)
    if (itemGroupId !== undefined) {
        result = result.filter((item) => item.groupId !== itemGroupId)
    }
    return result
}

export const getNextAvailableTask = (arr: Task[]): Task | null => {
    const processingGroupIds = arr.filter((x) => x.status === "processing").map((x) => x.groupId)

    return (
        arr.find(
            (item) =>
                item.status !== "processing" &&
                (item.groupId === undefined || !processingGroupIds.includes(item.groupId)),
        ) || null
    )
}
