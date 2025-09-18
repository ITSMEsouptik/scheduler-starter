import amqplib, { Channel, Connection, Options } from 'amqplib';

export type AmqpConfig = {
  url: string;
  exchange: string; // topic exchange
};

export async function initAmqp(cfg: AmqpConfig) {
  const conn = await amqplib.connect(cfg.url);
  const ch = await conn.createChannel();
  await ch.assertExchange(cfg.exchange, 'topic', { durable: true });
  return { conn, ch };
}

export async function publishTask(ch: Channel, exchange: string, routingKey: string, msg: object) {
  const payload = Buffer.from(JSON.stringify(msg));
  ch.publish(exchange, routingKey, payload, {
    persistent: true,
    contentType: 'application/json'
  });
}
