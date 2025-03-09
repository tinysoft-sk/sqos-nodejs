import { Task } from "./task"
import { removeItemsByIdFromArray, removeItemsByIdAndGroupIdFromArray, getNextAvailableTask } from "./utils"

describe("removeItemsByIdFromArray", () => {
    test("removes item with id 1", () => {
        expect(
            removeItemsByIdFromArray(
                [
                    { id: "1", groupId: "group-1" } as Task,
                    { id: "2", groupId: "group-2" } as Task,
                    { id: "3", groupId: "group-3" } as Task,
                    { id: "4", groupId: "group-1" } as Task,
                    { id: "5", groupId: "group-2" } as Task,
                    { id: "6", groupId: "group-3" } as Task,
                ],
                "1",
            ),
        ).toEqual([
            { id: "2", groupId: "group-2" } as Task,
            { id: "3", groupId: "group-3" } as Task,
            { id: "4", groupId: "group-1" } as Task,
            { id: "5", groupId: "group-2" } as Task,
            { id: "6", groupId: "group-3" } as Task,
        ])
    })
})

describe("removeItemsByIdAndGroupIdFromArray", () => {
    test.each([
        [
            "1",
            "group-1",
            [
                { id: "2", groupId: "group-2" } as Task,
                { id: "3", groupId: "group-3" } as Task,
                { id: "5", groupId: "group-2" } as Task,
                { id: "6", groupId: "group-3" } as Task,
            ],
        ],
        [
            "1",
            null,
            [
                { id: "2", groupId: "group-2" } as Task,
                { id: "3", groupId: "group-3" } as Task,
                { id: "4", groupId: "group-1" } as Task,
                { id: "5", groupId: "group-2" } as Task,
                { id: "6", groupId: "group-3" } as Task,
            ],
        ],
    ])("removes items with id %s and groupId %s", (input_id, input_group_id, expected) => {
        expect(
            removeItemsByIdAndGroupIdFromArray(
                [
                    { id: "1", groupId: "group-1" } as Task,
                    { id: "2", groupId: "group-2" } as Task,
                    { id: "3", groupId: "group-3" } as Task,
                    { id: "4", groupId: "group-1" } as Task,
                    { id: "5", groupId: "group-2" } as Task,
                    { id: "6", groupId: "group-3" } as Task,
                ],
                input_id,
                input_group_id,
            ),
        ).toEqual(expected)
    })
})

describe("getNextAvailableTask", () => {
    test.each([
        [
            [
                { id: "1", groupId: "group-1" } as Task,
                { id: "2", groupId: "group-2" } as Task,
                { id: "3", groupId: "group-3" } as Task,
                { id: "4", groupId: "group-1" } as Task,
                { id: "5", groupId: "group-2" } as Task,
                { id: "6", groupId: "group-3" } as Task,
            ],
            { id: "1", groupId: "group-1" } as Task,
        ],
        [
            [
                { id: "1", groupId: "group-1", status: "processing" } as Task,
                { id: "2", groupId: "group-2", status: "processing" } as Task,
                { id: "3", groupId: "group-3" } as Task,
                { id: "4", groupId: "group-1" } as Task,
                { id: "5", groupId: "group-2" } as Task,
                { id: "6", groupId: "group-3" } as Task,
            ],
            { id: "3", groupId: "group-3" } as Task,
        ],
        [
            [
                { id: "1", groupId: "group-1", status: "processing" } as Task,
                { id: "2", groupId: "group-2", status: "processing" } as Task,
                { id: "3", groupId: "group-3", status: "processing" } as Task,
                { id: "4", groupId: "group-1" } as Task,
                { id: "5", groupId: "group-2" } as Task,
                { id: "6", groupId: "group-3" } as Task,
            ],
            null,
        ],
        [
            [
                { id: "1", groupId: null } as Task,
                { id: "2", groupId: "group-2" } as Task,
                { id: "3", groupId: "group-3" } as Task,
                { id: "4", groupId: "group-1" } as Task,
                { id: "5", groupId: "group-2" } as Task,
                { id: "6", groupId: "group-3" } as Task,
            ],
            { id: "1", groupId: null } as Task,
        ],
        [
            [
                { id: "1", groupId: null, status: "processing" } as Task,
                { id: "2", groupId: "group-2" } as Task,
                { id: "3", groupId: "group-3" } as Task,
                { id: "4", groupId: "group-1" } as Task,
                { id: "5", groupId: "group-2" } as Task,
                { id: "6", groupId: "group-3" } as Task,
            ],
            { id: "2", groupId: "group-2" } as Task,
        ],
        [
            [
                { id: "1", groupId: null, status: "processing" } as Task,
                { id: "2", groupId: null, status: "processing" } as Task,
                { id: "3", groupId: null, status: "processing" } as Task,
                { id: "4", groupId: "group-1" } as Task,
                { id: "5", groupId: "group-2" } as Task,
                { id: "6", groupId: "group-3" } as Task,
            ],
            { id: "4", groupId: "group-1" } as Task,
        ],
        [
            [
                { groupId: "satellite", id: "fe75fc1c-eef0-495e-9e10-44f4149446a3", status: "processing" } as Task,
                { groupId: "event-bridge", id: "f7f7d725-4ba7-47c4-8e03-ab88378d0b5c", status: "pending" } as Task,
                { groupId: "event-bridge", id: "01f668ee-b7f9-418e-a899-7a22206a7108", status: "processing" } as Task,
                { groupId: "event-bridge", id: "79304632-3d22-482d-906f-e73ceb84ba42", status: "processing" } as Task,
                { groupId: "event-bridge", id: "70e44efe-5b9f-4cca-8d42-70f8bc5e2020", status: "processing" } as Task,
                { groupId: "event-bridge", id: "2d00714f-e841-4fe5-8bcd-77940c38ba3b", status: "processing" } as Task,
                { groupId: "event-bridge", id: "8a5f746d-88d8-4b7d-8c21-8e3f6ed5b165", status: "processing" } as Task,
                { groupId: "event-bridge", id: "b72a3436-bc87-42ee-b1a8-4bc703a6d107", status: "processing" } as Task,
                { groupId: "event-bridge", id: "b33e2b8b-12de-480f-af1d-ef2b121a7339", status: "processing" } as Task,
            ],
            null,
        ],
    ])("gets next available task from input array", (input_arr, expected) => {
        expect(getNextAvailableTask(input_arr)).toEqual(expected)
    })
})
