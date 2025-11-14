import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { typeDefs } from './lib/schemas/schema.js';
import { resolvers } from './lib/resolvers/index.js';
import { Context } from './lib/context/types.js';
import { httpContextFunction, wsContextFunction } from './lib/context/context.js';

// Create executable schema
const schema = makeExecutableSchema({ typeDefs, resolvers });

// Create Express app and HTTP server
const app = express();
const httpServer = createServer(app);

// Create WebSocket server
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
});

// Set up WebSocket server for subscriptions
const serverCleanup = useServer(
  {
    schema,
    context: wsContextFunction,
  },
  wsServer
);

// Create Apollo Server
const server = new ApolloServer<Context>({
  schema,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
});

// Start the server
await server.start();

// Configure CORS
app.use(
  cors({
    origin: 'http://localhost:4200',
    credentials: true,
  })
);

// Middleware
app.use(express.json());
app.use(cookieParser());

// Apply Apollo GraphQL middleware
app.use(
  '/graphql',
  expressMiddleware(server, {
    context: httpContextFunction,
  })
);

const PORT = 4000;
httpServer.listen(PORT, () => {
  console.log(`🚀  Server ready at: http://localhost:${PORT}/graphql`);
  console.log(`🚀  Subscriptions ready at: ws://localhost:${PORT}/graphql`);
});
