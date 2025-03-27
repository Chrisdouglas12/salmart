import { io } from "socket.io-client";

const socket = io('http://localhost:3000'); // Change to your server URL

socket.on('connect', () => {
  console.log('Connected to server');
});