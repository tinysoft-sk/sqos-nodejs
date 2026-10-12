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

describe("TaskProcessor stop() with group-blocked tasks", () => {
    it("should process tasks pending behind a busy group after stop() is called", async () => {
        const storage = new TaskStorage(10)
        const processed: string[] = []

        const handler = async (task: any) => {
            await new Promise((resolve) => setTimeout(resolve, 20))
            processed.push(task.id)
            storage.setFinished(task.id)
        }

        const processor = new TaskProcessor(storage, handler)

        storage.addTasks([
            { id: "1", status: "pending", groupId: "player-A" },
            { id: "2", status: "pending", groupId: "player-A" },
            { id: "3", status: "pending", groupId: "player-A" },
            { id: "4", status: "pending", groupId: "player-B" },
        ])

        processor.start()

        // Let the loop start "1" (and "4"), leaving "2" and "3" blocked behind "1".
        await new Promise((resolve) => setTimeout(resolve, 5))
        expect(
            storage
                .getProcessingTasks()
                .map((t) => t.id)
                .sort(),
        ).toEqual(["1", "4"])

        processor.stop()
        await processor.waitForStop()

        expect(processed).toHaveLength(4)
        expect(processed.filter((id) => ["1", "2", "3"].includes(id))).toEqual(["1", "2", "3"])
        expect(storage.isEmpty()).toBe(true)
    })

    it("should keep processing a group in order even when a handler fails", async () => {
        const storage = new TaskStorage(10)
        const processed: string[] = []

        const handler = async (task: any) => {
            await new Promise((resolve) => setTimeout(resolve, 10))
            processed.push(task.id)
            if (task.id === "1") {
                storage.setDiscarded(task.id, "delete-message")
                throw new Error("boom")
            }
            storage.setFinished(task.id)
        }

        const processor = new TaskProcessor(storage, handler)

        storage.addTasks([
            { id: "1", status: "pending", groupId: "player-A" },
            { id: "2", status: "pending", groupId: "player-A" },
        ])

        processor.start()
        await new Promise((resolve) => setTimeout(resolve, 2))
        processor.stop()
        await processor.waitForStop()

        expect(processed).toEqual(["1", "2"])
        expect(storage.isEmpty()).toBe(true)
    })

    it("should not hang after stop() if a processing task is never finished", async () => {
        const storage = new TaskStorage(10)

        // Misbehaving handler: resolves without removing the task from storage.
        const handler = async () => {
            await new Promise((resolve) => setTimeout(resolve, 5))
        }

        const processor = new TaskProcessor(storage, handler)

        storage.addTasks([
            { id: "1", status: "pending", groupId: "player-A" },
            { id: "2", status: "pending", groupId: "player-A" },
        ])

        processor.start()
        await new Promise((resolve) => setTimeout(resolve, 2))
        processor.stop()

        let timer: NodeJS.Timeout | undefined
        const timeout = new Promise((resolve) => {
            timer = setTimeout(() => resolve("timeout"), 500)
        })
        const result = await Promise.race([processor.waitForStop().then(() => "stopped"), timeout])
        clearTimeout(timer)

        expect(result).toBe("stopped")
    })
})
