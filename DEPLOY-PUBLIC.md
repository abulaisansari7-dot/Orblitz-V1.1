# OrBlitz — Public Internet Deployment

OrBlitz is a Node.js + Express + Socket.IO multiplayer game. The server is configured to listen on `0.0.0.0`, use the platform `PORT`, expose `/health`, and support polling/WebSocket transports.

## Render deployment

1. Put this project in a GitHub repository.
2. Sign in to Render.
3. Choose **New → Web Service** and connect the repository.
4. Use:
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/health`
5. Deploy.
6. Render provides a public `https://...onrender.com` URL.
7. Open that URL on any phone, tablet, laptop, or desktop from any network with internet access.
8. Share the URL. Players use the same URL and join using the room code.

## Important

The game currently stores rooms in server memory. Keep the deployment at one running instance for the challenge. If you later scale to multiple instances, add a Socket.IO Redis adapter so players connected to different instances share room state.
