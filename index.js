const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../models/db');
const { v4: uuidv4 } = require('uuid');

// GET /api/quiz/:id  — get quiz + questions (no correct answers exposed)
router.get('/:id', async (req, res) => {
  try {
    const pool = getPool();
    const quiz = await pool.request()
      .input('id', sql.UniqueIdentifier, req.params.id)
      .query(`SELECT id, title, description FROM Quizzes WHERE id = @id AND is_active = 1`);

    if (!quiz.recordset.length) return res.status(404).json({ error: 'Quiz not found or inactive' });

    const questions = await pool.request()
      .input('quiz_id', sql.UniqueIdentifier, req.params.id)
      .query(`SELECT id, text, options, order_num FROM Questions WHERE quiz_id = @quiz_id ORDER BY order_num`);

    const result = quiz.recordset[0];
    result.questions = questions.recordset.map(q => ({
      ...q,
      options: JSON.parse(q.options)
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/quiz  — list all active quizzes
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request()
      .query(`SELECT id, title, description, created_at FROM Quizzes WHERE is_active = 1 ORDER BY created_at DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/quiz/:id/join  — participant joins a quiz
router.post('/:id/join', async (req, res) => {
  const { name, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const pool = getPool();
    const participantId = uuidv4();

    await pool.request()
      .input('id', sql.UniqueIdentifier, participantId)
      .input('quiz_id', sql.UniqueIdentifier, req.params.id)
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email || null)
      .input('session_id', sql.NVarChar, req.session.id)
      .query(`INSERT INTO Participants (id, quiz_id, name, email, session_id) VALUES (@id, @quiz_id, @name, @email, @session_id)`);

    req.session.participantId = participantId;
    req.session.quizId = req.params.id;

    // Notify all connected clients via Socket.IO
    req.io.to(`quiz_${req.params.id}`).emit('participant_joined', { name, total: await getParticipantCount(req.params.id) });

    res.json({ participantId, message: 'Joined successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/quiz/:id/answer  — submit an answer
router.post('/:id/answer', async (req, res) => {
  const { questionId, chosenIdx } = req.body;
  const participantId = req.session.participantId;

  if (!participantId) return res.status(401).json({ error: 'Join the quiz first' });

  try {
    const pool = getPool();

    // Check correct answer
    const q = await pool.request()
      .input('id', sql.UniqueIdentifier, questionId)
      .query(`SELECT correct_idx FROM Questions WHERE id = @id`);

    if (!q.recordset.length) return res.status(404).json({ error: 'Question not found' });

    const isCorrect = q.recordset[0].correct_idx === parseInt(chosenIdx);

    await pool.request()
      .input('participant_id', sql.UniqueIdentifier, participantId)
      .input('question_id', sql.UniqueIdentifier, questionId)
      .input('chosen_idx', sql.Int, parseInt(chosenIdx))
      .input('is_correct', sql.Bit, isCorrect)
      .query(`INSERT INTO Answers (participant_id, question_id, chosen_idx, is_correct) VALUES (@participant_id, @question_id, @chosen_idx, @is_correct)`);

    // Emit live update
    const stats = await getQuestionStats(questionId);
    req.io.to(`quiz_${req.params.id}`).emit('answer_update', { questionId, stats });

    res.json({ isCorrect, message: isCorrect ? '✅ Correct!' : '❌ Wrong answer' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function getParticipantCount(quizId) {
  const pool = getPool();
  const r = await pool.request()
    .input('quiz_id', sql.UniqueIdentifier, quizId)
    .query(`SELECT COUNT(*) as cnt FROM Participants WHERE quiz_id = @quiz_id`);
  return r.recordset[0].cnt;
}

async function getQuestionStats(questionId) {
  const pool = getPool();
  const r = await pool.request()
    .input('question_id', sql.UniqueIdentifier, questionId)
    .query(`SELECT chosen_idx, COUNT(*) as votes FROM Answers WHERE question_id = @question_id GROUP BY chosen_idx`);
  return r.recordset;
}

module.exports = router;
