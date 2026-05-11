import { TaskVisibilityTimeoutManager } from "./task_visibility_timeout_manager"
import { TaskStorage } from "./task_storage"

describe("TaskVisibilityTimeoutManager Unit Tests", () => {
    it("should stop quickly when stop() is called during heartbeat interval", async () => {
        const storage = new TaskStorage(10)
        const mockSqs: any = { send: jest.fn() }

        // Large interval, but we want it to stop fast
        const manager = new TaskVisibilityTimeoutManager(mockSqs, "url", storage, 60, 60)

        manager.start()

        // Must have at least one task to enter the loop's sleep
        storage.addTasks([{ id: "1", status: "processing" }])

        // Wait a bit to ensure it enters the loop and starts sleeping
        await new Promise((resolve) => setTimeout(resolve, 10))

        const startTime = Date.now()
        manager.stop()
        await manager.waitForStop()
        const duration = Date.now() - startTime

        // Should stop almost immediately (certainly less than 60s)
        expect(duration).toBeLessThan(1000)
    })

    it("should evict tasks from storage when visibility extension fails for individual messages", async () => {
        const storage = new TaskStorage(10)

        // Mock SQS to return partial failure
        const mockSqs: any = {
            send: jest.fn().mockResolvedValue({
                Successful: [{ Id: "task-1" }],
                Failed: [
                    {
                        Id: "task-2",
                        SenderFault: true,
                        Code: "InvalidParameterValue",
                        Message: "Receipt handle has expired",
                    },
                ],
            }),
        }

        // Short heartbeat so the test runs quickly
        const manager = new TaskVisibilityTimeoutManager(mockSqs, "url", storage, 0.01, 60)

        storage.addTasks([
            { id: "task-1", status: "processing", groupId: "group-a" },
            { id: "task-2", status: "processing", groupId: "group-b" },
            { id: "task-3", status: "pending", groupId: "group-b" },
        ])

        const errors: any[] = []
        manager.subscribe("error", (err: any) => errors.push(err))

        manager.start()

        // Wait for at least one heartbeat cycle
        await new Promise((resolve) => setTimeout(resolve, 100))

        manager.stop()
        await manager.waitForStop()

        // task-2 should have been evicted from storage
        const processingTasks = storage.getProcessingTasks()
        expect(processingTasks.map((t) => t.id)).toEqual(["task-1"])

        // task-3 (pending, same group as task-2) should still be in storage
        // because evictTask only removes the specific task, not the group
        const nextTask = storage.getNext()
        expect(nextTask).not.toBeNull()
        expect(nextTask!.id).toBe("task-3")

        // Error should have been dispatched
        expect(errors.length).toBeGreaterThanOrEqual(1)
        const evictionError = errors.find(
            (e) => Array.isArray(e) && e[0] === "Failed to extend visibility timeout, evicting task",
        )
        expect(evictionError).toBeDefined()
        expect(evictionError[1].taskId).toBe("task-2")
        expect(evictionError[1].code).toBe("InvalidParameterValue")
    })

    it("should unblock FIFO group when stuck processing task is evicted", async () => {
        const storage = new TaskStorage(10)

        // First call: task-1's visibility extension fails
        // Second call onwards: no more processing tasks (task-1 evicted)
        const mockSqs: any = {
            send: jest.fn().mockResolvedValue({
                Successful: [],
                Failed: [
                    {
                        Id: "task-1",
                        SenderFault: true,
                        Code: "InvalidParameterValue",
                        Message: "Message does not exist",
                    },
                ],
            }),
        }

        const manager = new TaskVisibilityTimeoutManager(mockSqs, "url", storage, 0.01, 60)

        // task-1 is stuck processing in group-a, blocking task-2 (pending, same group)
        storage.addTasks([
            { id: "task-1", status: "processing", groupId: "group-a" },
            { id: "task-2", status: "pending", groupId: "group-a" },
        ])

        // Before eviction: task-2 should be blocked (same group as processing task-1)
        expect(storage.getNext()).toBeNull()

        manager.start()

        // Wait for heartbeat to evict task-1
        await new Promise((resolve) => setTimeout(resolve, 100))

        manager.stop()
        await manager.waitForStop()

        // After eviction: task-2 should now be available
        const nextTask = storage.getNext()
        expect(nextTask).not.toBeNull()
        expect(nextTask!.id).toBe("task-2")
    })

    it("should handle full batch failure gracefully without evicting tasks", async () => {
        const storage = new TaskStorage(10)

        // Mock SQS to throw a network error (full batch failure)
        const mockSqs: any = {
            send: jest.fn().mockRejectedValue(new Error("Network timeout")),
        }

        const manager = new TaskVisibilityTimeoutManager(mockSqs, "url", storage, 0.01, 60)

        storage.addTasks([{ id: "task-1", status: "processing", groupId: "group-a" }])

        const errors: any[] = []
        manager.subscribe("error", (err: any) => errors.push(err))

        manager.start()

        // Wait for at least one heartbeat cycle
        await new Promise((resolve) => setTimeout(resolve, 100))

        manager.stop()
        await manager.waitForStop()

        // Task should NOT be evicted (we don't know if the receipt handle is actually expired)
        const processingTasks = storage.getProcessingTasks()
        expect(processingTasks.map((t) => t.id)).toEqual(["task-1"])

        // Error should still be dispatched
        expect(errors.length).toBeGreaterThanOrEqual(1)
    })

    it("should not extend visibility for tasks younger than heartbeatInterval / 2", async () => {
        const storage = new TaskStorage(10)
        const mockSqs: any = { send: jest.fn() }

        const manager = new TaskVisibilityTimeoutManager(mockSqs, "url", storage, 0.01, 60)

        storage.addTasks([{ id: "task-1", status: "processing", groupId: "group-a" }])
        // Stamp addedAt far in the future so the task always looks too young to extend
        storage.getProcessingTasks()[0].addedAt = Date.now() + 60_000

        manager.start()

        // Wait for several heartbeat cycles
        await new Promise((resolve) => setTimeout(resolve, 50))

        manager.stop()
        await manager.waitForStop()

        expect(mockSqs.send).not.toHaveBeenCalled()
    })
})
