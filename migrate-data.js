import fs from "fs/promises";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

console.log("Current working directory:", process.cwd());
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASSWORD:", process.env.DB_PASSWORD);
console.log("DB_NAME:", process.env.DB_NAME);

async function migrateData() {
  try {
    // Migrate lessons
    const lessonsData = await fs.readFile("lessons.json", "utf-8").catch(err => {
      console.error("Error reading lessons.json:", err);
      throw err;
    });
    const parsedLessonsData = JSON.parse(lessonsData);

    for (const lesson of parsedLessonsData) {
      await pool.query("INSERT INTO lessons (title, content, media_type, media_url) VALUES (?, ?, ?, ?)", [
        lesson.title,
        lesson.content,
        lesson.mediaType,
        lesson.mediaUrl,
      ]);
    }
    console.log("Lessons migrated successfully");
    console.log(`Migrated ${parsedLessonsData.length} lessons.`);

    // Migrate scenarios
    const scenariosData = await fs.readFile("scenarios.json", "utf-8").catch(err => {
      console.error("Error reading scenarios.json:", err);
      throw err;
    });
    const parsedScenariosData = JSON.parse(scenariosData);

    for (const scenario of parsedScenariosData) {
      const [result] = await pool.query(
        "INSERT INTO scenarios (title, description, media_type, media_url) VALUES (?, ?, ?, ?)",
        [scenario.title, scenario.description, scenario.mediaType, scenario.mediaUrl],
      );
      const scenarioId = result.insertId;

      for (const choice of scenario.choices) {
        await pool.query(
          "INSERT INTO scenario_choices (scenario_id, choice_text, outcome, survivability) VALUES (?, ?, ?, ?)",
          [scenarioId, choice.text, choice.outcome, choice.survivability],
        );
      }
    }
    console.log("Scenarios migrated successfully");
    console.log(`Migrated ${parsedScenariosData.length} scenarios.`);

    // Migrate users (if you have any)
    const usersData = await fs.readFile("users.json", "utf-8").catch(err => {
      console.error("Error reading users.json:", err);
      throw err;
    });
    const parsedUsersData = JSON.parse(usersData);

    for (const user of parsedUsersData) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await pool.query(
        "INSERT INTO users (username, password, security_question, security_answer) VALUES (?, ?, ?, ?)",
        [user.username, hashedPassword, user.securityQuestion, user.securityAnswer],
      );
    }
    console.log("Users migrated successfully");
    console.log(`Migrated ${parsedUsersData.length} users.`);
  } catch (error) {
    console.error("Migration error:", error);
  } finally {
    await pool.end();
  }
}

migrateData();
