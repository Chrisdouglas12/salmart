import { io } from 'socket.io-client';
const socket = io('http://localhost:3000', {
  transports: ['websocket'],
});

// Join the user's room
socket.emit('joinRoom', userId);

// Send a message
function sendMessage(senderId, receiverId, text) {
  socket.emit('sendMessage', { senderId, receiverId, text });
}

// Listen for incoming messages
socket.on('receiveMessage', (message) => {
  console.log('New message received:', message);
  // Update the UI with the new message
});