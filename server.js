import express from "express"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import mysql from "mysql2/promise"
import dotenv from "dotenv"

dotenv.config()

const app = express()
app.use(express.json())

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (token == null) return res.sendStatus(401)

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403)
    req.user = user
    next()
  })
}

// User Authentication
app.post("/login", async (req, res) => {
  const { username, password } = req.body
  try {
    const [rows] = await pool.execute("SELECT * FROM users WHERE username = ?", [username])
    if (rows.length > 0) {
      const user = rows[0]
      const match = await bcrypt.compare(password, user.password)
      if (match) {
        const token = jwt.sign(
          { id: user.id, username: user.username, isAdmin: user.isAdmin },
          process.env.JWT_SECRET,
          { expiresIn: "1h" },
        )
        res.json({ success: true, token, user: { id: user.id, username: user.username, isAdmin: user.isAdmin } })
      } else {
        res.status(401).json({ error: "Invalid credentials" })
      }
    } else {
      res.status(401).json({ error: "User not found" })
    }
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Database error" })
  }
})

app.post("/register", async (req, res) => {
  const { username, password, securityQuestion, securityAnswer } = req.body
  try {
    const hashedPassword = await bcrypt.hash(password, 10)
    const [result] = await pool.execute(
      "INSERT INTO users (username, password, security_question, security_answer) VALUES (?, ?, ?, ?)",
      [username, hashedPassword, securityQuestion, securityAnswer],
    )
    res.json({ success: true, userId: result.insertId })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ error: "Database error" })
  }
})

// Lessons CRUD
app.get("/lessons", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM lessons")
    res.json(rows)
  } catch (error) {
    console.error("Error fetching lessons:", error)
    res.status(500).json({ error: "Database error" })
  }
})

app.post("/lessons", authenticateToken, async (req, res) => {
  const { title, content, mediaType, mediaUrl, difficulty } = req.body
  try {
    const [result] = await pool.execute(
      "INSERT INTO lessons (title, content, media_type, media_url, difficulty) VALUES (?, ?, ?, ?, ?)",
      [title, content, mediaType, mediaUrl, difficulty],
    )
    res.status(201).json({ id: result.insertId, title, content, mediaType, mediaUrl, difficulty })
  } catch (error) {
    console.error("Error creating lesson:", error)
    res.status(500).json({ error: "Database error" })
  }
})

app.put("/lessons/:id", authenticateToken, async (req, res) => {
  const { id } = req.params
  const { title, content, mediaType, mediaUrl, difficulty } = req.body
  try {
    await pool.execute(
      "UPDATE lessons SET title = ?, content = ?, media_type = ?, media_url = ?, difficulty = ? WHERE id = ?",
      [title, content, mediaType, mediaUrl, difficulty, id],
    )
    res.json({ id, title, content, mediaType, mediaUrl, difficulty })
  } catch (error) {
    console.error("Error updating lesson:", error)
    res.status(500).json({ error: "Database error" })
  }
})

app.delete("/lessons/:id", authenticateToken, async (req, res) => {
  const { id } = req.params
  try {
    await pool.execute("DELETE FROM lessons WHERE id = ?", [id])
    res.json({ success: true })
  } catch (error) {
    console.error("Error deleting lesson:", error)
    res.status(500).json({ error: "Database error" })
  }
})

// Scenarios CRUD
app.get("/scenarios", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM scenarios")
    res.json(rows)
  } catch (error) {
    console.error("Error fetching scenarios:", error)
    res.status(500).json({ error: "Database error" })
  }
})

app.post("/scenarios", authenticateToken, async (req, res) => {
  const { title, description, mediaType, mediaUrl, choices, difficulty } = req.body
  try {
    const [result] = await pool.execute(
      "INSERT INTO scenarios (title, description, media_type, media_url, difficulty) VALUES (?, ?, ?, ?, ?)",
      [title, description, mediaType, mediaUrl, difficulty],
    )
    const scenarioId = result.insertId

    for (const choice of choices) {
      await pool.execute(
        "INSERT INTO scenario_choices (scenario_id, choice_text, outcome, survivability) VALUES (?, ?, ?, ?)",
        [scenarioId, choice.text, choice.outcome, choice.survivability],
      )
    }

    res.status(201).json({ id: scenarioId, title, description, mediaType, mediaUrl, choices, difficulty })
  } catch (error) {
    console.error("Error creating scenario:", error)
    res.status(500).json({ error: "Database error" })
  }
})

app.put("/scenarios/:id", authenticateToken, async (req, res) => {
  const { id } = req.params
  const { title, description, mediaType, mediaUrl, choices, difficulty } = req.body
  try {
    await pool.execute(
      "UPDATE scenarios SET title = ?, description = ?, media_type = ?, media_url = ?, difficulty = ? WHERE id = ?",
      [title, description, mediaType, mediaUrl, difficulty, id],
    )

    await pool.execute("DELETE FROM scenario_choices WHERE scenario_id = ?", [id])

    for (const choice of choices) {
      await pool.execute(
        "INSERT INTO scenario_choices (scenario_id, choice_text, outcome, survivability) VALUES (?, ?, ?, ?)",
        [id, choice.text, choice.outcome, choice.survivability],
      )
    }

    res.json({ id, title, description, mediaType, mediaUrl, choices, difficulty })
  } catch (error) {
    console.error("Error updating scenario:", error)
    res.status(500).json({ error: "Database error" })
  }
})

app.delete("/scenarios/:id", authenticateToken, async (req, res) => {
  const { id } = req.params
  try {
    await pool.execute("DELETE FROM scenario_choices WHERE scenario_id = ?", [id])
    await pool.execute("DELETE FROM scenarios WHERE id = ?", [id])
    res.json({ success: true })
  } catch (error) {
    console.error("Error deleting scenario:", error)
    res.status(500).json({ error: "Database error" })
  }
})

// User Progress
app.get("/user-progress/:userId", authenticateToken, async (req, res) => {
  const { userId } = req.params
  try {
    const [rows] = await pool.execute("SELECT * FROM user_progress WHERE user_id = ?", [userId])
    res.json(rows)
  } catch (error) {
    console.error("Error fetching user progress:", error)
    res.status(500).json({ error: "Database error" })
  }
})

app.post("/user-progress", authenticateToken, async (req, res) => {
  const { userId, scenarioId, choiceId, outcome } = req.body
  try {
    const [result] = await pool.execute(
      "INSERT INTO user_progress (user_id, scenario_id, choice_id, outcome) VALUES (?, ?, ?, ?)",
      [userId, scenarioId, choiceId, outcome],
    )
    res.status(201).json({ id: result.insertId, userId, scenarioId, choiceId, outcome })
  } catch (error) {
    console.error("Error saving user progress:", error)
    res.status(500).json({ error: "Database error" })
  }
})

// User Profile
app.get("/user-profile", authenticateToken, async (req, res) => {
  try {
    const [user] = await pool.execute("SELECT id, username, created_at FROM users WHERE id = ?", [req.user.id])
    const [completedLessons] = await pool.execute(
      "SELECT COUNT(*) as count FROM user_lesson_progress WHERE user_id = ? AND completed = 1",
      [req.user.id],
    )
    const [completedScenarios] = await pool.execute("SELECT COUNT(*) as count FROM user_progress WHERE user_id = ?", [
      req.user.id,
    ])
    const [quizScores] = await pool.execute(
      "SELECT AVG(score) as average_score FROM user_quiz_scores WHERE user_id = ?",
      [req.user.id],
    )

    res.json({
      user: user[0],
      progress: {
        completedLessons: completedLessons[0].count,
        completedScenarios: completedScenarios[0].count,
        averageQuizScore: quizScores[0].average_score || 0,
      },
    })
  } catch (error) {
    console.error("Error fetching user profile:", error)
    res.status(500).json({ error: "Database error" })
  }
})

// Leaderboard
app.get("/leaderboard", async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT u.username, 
             COUNT(DISTINCT ulp.lesson_id) as completed_lessons,
             COUNT(DISTINCT up.scenario_id) as completed_scenarios,
             AVG(uqs.score) as average_quiz_score
      FROM users u
      LEFT JOIN user_lesson_progress ulp ON u.id = ulp.user_id AND ulp.completed = 1
      LEFT JOIN user_progress up ON u.id = up.user_id
      LEFT JOIN user_quiz_scores uqs ON u.id = uqs.user_id
      GROUP BY u.id
      ORDER BY completed_lessons DESC, completed_scenarios DESC, average_quiz_score DESC
      LIMIT 10
    `)
    res.json(rows)
  } catch (error) {
    console.error("Error fetching leaderboard:", error)
    res.status(500).json({ error: "Database error" })
  }
})

// Feedback
app.post("/feedback", authenticateToken, async (req, res) => {
  const { contentType, contentId, rating, comment } = req.body
  try {
    const [result] = await pool.execute(
      "INSERT INTO feedback (user_id, content_type, content_id, rating, comment) VALUES (?, ?, ?, ?, ?)",
      [req.user.id, contentType, contentId, rating, comment],
    )
    res.status(201).json({ id: result.insertId, userId: req.user.id, contentType, contentId, rating, comment })
  } catch (error) {
    console.error("Error saving feedback:", error)
    res.status(500).json({ error: "Database error" })
  }
})

// Recommendations
app.get("/recommendations", authenticateToken, async (req, res) => {
  try {
    const [userProgress] = await pool.execute(
      `
      SELECT AVG(uqs.score) as avg_quiz_score,
             COUNT(DISTINCT ulp.lesson_id) as completed_lessons,
             COUNT(DISTINCT up.scenario_id) as completed_scenarios
      FROM users u
      LEFT JOIN user_quiz_scores uqs ON u.id = uqs.user_id
      LEFT JOIN user_lesson_progress ulp ON u.id = ulp.user_id AND ulp.completed = 1
      LEFT JOIN user_progress up ON u.id = up.user_id
      WHERE u.id = ?
    `,
      [req.user.id],
    )

    const userLevel = calculateUserLevel(userProgress[0])

    const [recommendedLessons] = await pool.execute(
      `
      SELECT l.*
      FROM lessons l
      LEFT JOIN user_lesson_progress ulp ON l.id = ulp.lesson_id AND ulp.user_id = ?
      WHERE ulp.id IS NULL AND l.difficulty <= ?
      ORDER BY l.difficulty DESC
      LIMIT 3
    `,
      [req.user.id, userLevel + 1],
    )

    const [recommendedScenarios] = await pool.execute(
      `
      SELECT s.*
      FROM scenarios s
      LEFT JOIN user_progress up ON s.id = up.scenario_id AND up.user_id = ?
      WHERE up.id IS NULL AND s.difficulty <= ?
      ORDER BY s.difficulty DESC
      LIMIT 3
    `,
      [req.user.id, userLevel + 1],
    )

    res.json({ recommendedLessons, recommendedScenarios })
  } catch (error) {
    console.error("Error generating recommendations:", error)
    res.status(500).json({ error: "Database error" })
  }
})

function calculateUserLevel(progress) {
  const { avg_quiz_score, completed_lessons, completed_scenarios } = progress
  return Math.floor(avg_quiz_score * 0.4 + completed_lessons * 0.3 + completed_scenarios * 0.3)
}

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

