import { TaskProcessor } from "./task_processor"
import { TaskStorage } from "./task_storage"

describe("TaskProcessor Unit Tests", () => {
    it("should process all pending tasks even after stop() is called", async () => {
        const storage = new TaskStorage(10)
        const processed: string[] = []

        const handler = async (task: any) => {
            // Simulate work
            await new Promise((resolve) => setTimeout(resolve, 10))
            processed.push(task.id)
            storage.setFinished(task.id)
        }

        const processor = new TaskProcessor(storage, handler)

        storage.addTasks([
            { id: "1", status: "pending" },
            { id: "2", status: "pending" },
            { id: "3", status: "pending" },
        ])

        processor.start()

        // Immediately stop. It should still process all 3.
        processor.stop()

        await processor.waitForStop()

        expect(processed).toHaveLength(3)
        expect(processed).toContain("1")
        expect(processed).toContain("2")
        expect(processed).toContain("3")
        expect(storage.isEmpty()).toBe(true)
    })

    it("should wait for active handlers to finish before stopping", async () => {
        const storage = new TaskStorage(10)
        let handlerFinished = false

        const handler = async (task: any) => {
            await new Promise((resolve) => setTimeout(resolve, 50))
            handlerFinished = true
            storage.setFinished(task.id)
        }

        const processor = new TaskProcessor(storage, handler)

        storage.addTasks([{ id: "1", status: "pending" }])

        processor.start()

        // Wait a tiny bit to ensure it started processing
        await new Promise((resolve) => setTimeout(resolve, 5))

        processor.stop()
        const stopPromise = processor.waitForStop()

        expect(handlerFinished).toBe(false)

        await stopPromise
        expect(handlerFinished).toBe(true)
    })
})
