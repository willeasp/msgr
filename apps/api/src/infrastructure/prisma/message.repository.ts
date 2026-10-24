import type { MessageRepository } from '../../application/ports.js';
import { ChatId } from '../../domain/chat.js';
import {
  MessageBody,
  MessageId,
  type Message,
  type MessageContent,
} from '../../domain/message.js';
import type { MovieSize } from '../../domain/movie.js';
import type { PictureSize } from '../../domain/picture.js';
import type { SoundLength } from '../../domain/sound.js';
import { UserId } from '../../domain/user.js';
import { Prisma, type PrismaClient } from './client.js';

/** A kept message: its media's sizes, never their bytes (`findMedia`). */
const messageFields = {
  id: true,
  chatId: true,
  senderId: true,
  content: true,
  pictureWidth: true,
  pictureHeight: true,
  movieWidth: true,
  movieHeight: true,
  movieFrames: true,
  soundFrames: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageFields }>;

const COLUMNS = Prisma.raw(
  Object.keys(messageFields)
    .map((column) => `"${column}"`)
    .join(', ')
);

export function prismaMessageRepository(db: PrismaClient): MessageRepository {
  return {
    async findByIds(ids) {
      const rows = await db.message.findMany({
        where: { id: { in: [...ids] } },
        select: messageFields,
      });
      return rows.map(toMessage);
    },

    async findPages(chatIds, page) {
      if (chatIds.length === 0) return [];
      // A cursor counts only within the same chat: from any other, or none,
      // it finds nothing.
      const window =
        page.kind === 'newest'
          ? Prisma.empty
          : Prisma.sql`
            AND ("createdAt", "id") ${Prisma.raw(
              page.kind === 'before' ? '<' : '>'
            )} (
              SELECT "createdAt", "id" FROM "Message"
              WHERE "id" = ${page.cursor} AND "chatId" = chat.id
            )`;
      const offset = page.kind === 'newest' ? page.offset : 0;
      // Each chat's newest first, straight down its (chatId, createdAt, id)
      // index and no further than the page: a long history costs nothing.
      const rows = await db.$queryRaw<MessageRow[]>`
        SELECT page.* FROM (
          SELECT DISTINCT unnest(ARRAY[${Prisma.join(chatIds)}]::text[]) AS id
        ) AS chat
        CROSS JOIN LATERAL (
          SELECT ${COLUMNS} FROM "Message"
          WHERE "chatId" = chat.id ${window}
          ORDER BY "createdAt" DESC, "id" DESC
          LIMIT ${page.limit} OFFSET ${offset}
        ) AS page
        ORDER BY page."chatId", page."createdAt", page."id"`;
      return rows.map(toMessage);
    },

    async findMedia(ids) {
      const rows = await db.message.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, picture: true, movie: true, sound: true },
      });
      return rows.flatMap(({ id, picture, movie, sound }) => {
        const [part, bytes] = picture
          ? (['picture', picture] as const)
          : movie
          ? (['movie', movie] as const)
          : sound
          ? (['sound', sound] as const)
          : [null, null];
        return part
          ? [{ messageId: MessageId(id), part, bytes: new Uint8Array(bytes) }]
          : [];
      });
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

// The CHECK keeps each part's size set exactly when its bytes are.

const pictureOf = ({
  pictureWidth: width,
  pictureHeight: height,
}: MessageRow): PictureSize | null =>
  width === null || height === null ? null : { width, height };

const movieOf = ({
  movieWidth: width,
  movieHeight: height,
  movieFrames: frames,
}: MessageRow): MovieSize | null =>
  width === null || height === null || frames === null
    ? null
    : { width, height, frames };

const soundOf = ({ soundFrames: frames }: MessageRow): SoundLength | null =>
  frames === null ? null : { frames };
