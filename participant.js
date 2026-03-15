const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'QuizDB',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt: process.env.NODE_ENV === 'production', // Required for Azure SQL
    trustServerCertificate: process.env.NODE_ENV !== 'production',
    enableArithAbort: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool;

async function connectDB() {
  try {
    pool = await sql.connect(config);
    console.log('✅ Connected to Azure SQL Database');
    await initSchema();
    return pool;
  } catch (err) {
    console.error('❌ DB Connection failed:', err.message);
    throw err;
  }
}

async function initSchema() {
  const request = pool.request();
  await request.query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Quizzes' AND xtype='U')
    CREATE TABLE Quizzes (
      id          UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
      title       NVARCHAR(200)    NOT NULL,
      description NVARCHAR(1000),
      created_by  NVARCHAR(100),
      is_active   BIT              DEFAULT 0,
      created_at  DATETIME2        DEFAULT GETUTCDATE()
    );

    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Questions' AND xtype='U')
    CREATE TABLE Questions (
      id          UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
      quiz_id     UNIQUEIDENTIFIER NOT NULL REFERENCES Quizzes(id) ON DELETE CASCADE,
      text        NVARCHAR(500)    NOT NULL,
      options     NVARCHAR(MAX)    NOT NULL, -- JSON array
      correct_idx INT              NOT NULL,
      order_num   INT              DEFAULT 0
    );

    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Participants' AND xtype='U')
    CREATE TABLE Participants (
      id          UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
      quiz_id     UNIQUEIDENTIFIER NOT NULL REFERENCES Quizzes(id),
      name        NVARCHAR(100)    NOT NULL,
      email       NVARCHAR(200),
      session_id  NVARCHAR(100),
      joined_at   DATETIME2        DEFAULT GETUTCDATE()
    );

    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Answers' AND xtype='U')
    CREATE TABLE Answers (
      id             UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
      participant_id UNIQUEIDENTIFIER NOT NULL REFERENCES Participants(id),
      question_id    UNIQUEIDENTIFIER NOT NULL REFERENCES Questions(id),
      chosen_idx     INT              NOT NULL,
      is_correct     BIT              NOT NULL,
      answered_at    DATETIME2        DEFAULT GETUTCDATE()
    );
  `);
  console.log('✅ Database schema ready');
}

function getPool() {
  if (!pool) throw new Error('Database not initialized. Call connectDB() first.');
  return pool;
}

module.exports = { connectDB, getPool, sql };
