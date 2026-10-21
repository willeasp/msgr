import type { MessageRepository } from '../../application/ports.js';
import { ChatId } from '../../domain/chat.js';
import {
  MessageBody,
  MessageId,
  type Message,
  type MessageContent,
} from '../../domain/message.js';
import type { Movie } from '../../domain/movie.js';
import type { Picture } from '../../domain/picture.js';
import type { Sound } from '../../domain/sound.js';
import { UserId } from '../../domain/user.js';
import { Prisma, type PrismaClient } from './client.js';

const messageFields = {
  id: true,
  chatId: true,
  senderId: true,
  content: true,
  picture: true,
  pictureWidth: true,
  pictureHeight: true,
  movie: true,
  movieWidth: true,
  movieHeight: true,
  movieFrames: true,
  sound: true,
  soundFrames: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageFields }>;

export function prismaMessageRepository(db: PrismaClient): MessageRepository {
  return {
    async findByIds(ids) {
      const rows = await db.message.findMany({
        where: { id: { in: [...ids] } },
        select: messageFields,
      });
      return rows.map(toMessage);
    },

    async findPages(chatIds, { limit, offset }) {
      if (chatIds.length === 0) return [];
      // One query for every chat: rank each chat's messages newest-first and
      // keep the requested window of ranks.
      const rows = await db.$queryRaw<MessageRow[]>`
        SELECT "id", "chatId", "senderId", "content", "picture",
          "pictureWidth", "pictureHeight", "movie", "movieWidth",
          "movieHeight", "movieFrames", "sound", "soundFrames", "createdAt"
        FROM (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY "chatId" ORDER BY "createdAt" DESC, "id" DESC
          ) AS "rank"
          FROM "Message"
          WHERE "chatId" IN (${Prisma.join(chatIds)})
        ) AS ranked
        WHERE "rank" > ${offset} AND "rank" <= ${offset + limit}
        ORDER BY "chatId", "createdAt", "id"`;
      return rows.map(toMessage);
    },

    async append(message) {
      const { chatId, senderId, createdAt, content, picture, movie, sound } =
        message;
      const body = {
        content,
        picture: picture?.deflated ?? null,
        pictureWidth: picture?.width ?? null,
        pictureHeight: picture?.height ?? null,
        movie: movie?.coded ?? null,
        movieWidth: movie?.width ?? null,
        movieHeight: movie?.height ?? null,
        movieFrames: movie?.frames ?? null,
        sound: sound?.coded ?? null,
        soundFrames: sound?.frames ?? null,
      };
      const [row] = await db.$transaction([
        db.message.create({
          data: { chatId, senderId, createdAt, ...body },
          select: messageFields,
        }),
        db.chat.update({
          where: { id: chatId },
          data: { updatedAt: createdAt },
          select: { id: true },
        }),
      ]);
      return toMessage(row);
    },
  };
}

function toMessage(row: MessageRow): Message {
  const sent = {
    id: MessageId(row.id),
    chatId: ChatId(row.chatId),
    senderId: UserId(row.senderId),
    createdAt: row.createdAt,
  };
  const body = MessageBody.of(
    row.content as MessageContent | null,
    pictureOf(row),
    movieOf(row),
    soundOf(row)
  );
  if (!body.ok) {
    throw new Error(`Message ${row.id} breaks its CHECK: ${body.error.reason}`);
  }
  return { ...sent, ...body.value };
}

/** Checked when it was sent, and held to its size by a CHECK since. */
function pictureOf({
  id,
  picture,
  pictureWidth: width,
  pictureHeight: height,
}: MessageRow): Picture | null {
  if (picture === null) return null;
  if (width === null || height === null) {
    throw new Error(`Message ${id} has a picture without its size`);
  }
  // Raw queries hand back a Buffer; keep one type either way.
  return { width, height, deflated: new Uint8Array(picture) } as Picture;
}

/** Checked when it was sent, and held to its size by a CHECK since. */
function movieOf({
  id,
  movie,
  movieWidth: width,
  movieHeight: height,
  movieFrames: frames,
}: MessageRow): Movie | null {
  if (movie === null) return null;
  if (width === null || height === null || frames === null) {
    throw new Error(`Message ${id} has a movie without its size`);
  }
  return { width, height, frames, coded: new Uint8Array(movie) } as Movie;
}

/** Checked when it was sent, and held to its length by a CHECK since. */
function soundOf({ id, sound, soundFrames: frames }: MessageRow): Sound | null {
  if (sound === null) return null;
  if (frames === null) {
    throw new Error(`Message ${id} has a sound without its length`);
  }
  return { frames, coded: new Uint8Array(sound) } as Sound;
}
