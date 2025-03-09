# Simple Queue On Steroids (SQOS)

SQOS is a Node.js library for processing messages from AWS SQS queues.

It suports all common SQS features such as:

- Standard and FIFO queues
- Visibility timeout management
- Long polling
- Configurable batch size

Aside from that, SQOS has one additional feature that makes it different from other SQS libraries (such as bbc/sqs-consumer):

**It can process more than 10 messages at a time.**

SQS has a batchSize parameter, but it's limited to 10 messages. With SQOS library, you can set the batchSize to any number you want.

## Installation

```bash
npm install @tinysoft-sk/sqos-nodejs
```

## Usage

```ts
import { Consumer } from "@tinysoft-sk/sqos-nodejs"

const consumer = new Consumer({
    queueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue.fifo",
    batchSize: 50,
    handleMessage: async (message) => {
        console.log(message)
    },
})

consumer.on("error", (error) => {
    console.error(error)
})

consumer.start()
```

## Why another SQS library?

We've been using the `sqs-consumer` library for a while, but it had some severe issues:

- when processing FIFO queue and using batchSize > 1, it started processing messages in parallel, completely ignoring FIFO nature of the queue
- processing is limited to 10 messages at a time, which is far from optimal, especially for I/O heavy jobs
