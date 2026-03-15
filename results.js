function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Join a quiz room
    socket.on('join_quiz', ({ quizId, participantName }) => {
      socket.join(`quiz_${quizId}`);
      socket.to(`quiz_${quizId}`).emit('user_joined', { name: participantName });
      console.log(`👤 ${participantName} joined quiz ${quizId}`);
    });

    // Admin joins the dashboard room
    socket.on('join_admin', ({ quizId }) => {
      socket.join(`admin_${quizId}`);
    });

    // Participant typing / activity ping
    socket.on('activity', ({ quizId }) => {
      io.to(`admin_${quizId}`).emit('participant_activity', { socketId: socket.id, ts: Date.now() });
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });
}

module.exports = { setupSocketHandlers };
