import { TaskVisibilityTimeoutManager } from "./task_visibility_timeout_manager"
import { TaskStorage } from "./task_storage"

describe("TaskVisibilityTimeoutManager Unit Tests", () => {
    it("should stop quickly when stop() is called during heartbeat interval", async () => {
        const storage = new TaskStorage(10)
        const mockSqs: any = { send: jest.fn() }

        // Large interval, but we want it to stop fast
        const manager = new TaskVisibilityTimeoutManager(mockSqs, "url", storage, 60)

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
})
