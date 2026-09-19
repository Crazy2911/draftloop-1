# DraftLoop

**AI-assisted essay feedback and rubric grading, with draft tracking and teacher review.**

DraftLoop is a web app where students submit essays against a rubric, receive AI grading with inline comments on structure, argument strength, and grammar, see a score breakdown by rubric category, and compare drafts over time. Teachers can review assigned submissions and record verified score overrides.

## Table of Contents

1. [Problem Context](#1-problem-context)
2. [Objective](#2-objective)
3. [Core Features (Must-Have)](#3-core-features-must-have)
4. [Stretch Features](#4-stretch-features)
5. [Authentication and Authorization](#5-authentication-and-authorization)
6. [How DraftLoop Handles the Key Challenges](#6-how-draftloop-handles-the-key-challenges)
7. [Technology Stack](#7-technology-stack)
8. [Project Structure](#8-project-structure)
9. [Setup](#9-setup)
10. [Testing with Sample Data](#10-testing-with-sample-data)
11. [Demo Flow](#11-demo-flow)
12. [Deployment](#12-deployment)
13. [Validation and Reliability](#13-validation-and-reliability)
14. [Security](#14-security)
15. [Requirements Coverage](#15-requirements-coverage)
16. [Future Improvements](#16-future-improvements)

---

## 1. Problem Context

Teachers rarely have time to give detailed, individualized feedback on every essay draft, especially in large classes. As a result, students often receive feedback only once, after the final grade is already set.

Students want to improve between drafts, but without fast feedback they are left guessing whether their argument is strong, their structure makes sense, or their grammar needs work. Existing grammar checkers catch surface-level errors but say nothing about argument quality or structural coherence, and rubric-based grading is almost always a manual, teacher-only process.

DraftLoop gives students rubric-aligned, structural, and argumentative feedback within seconds, so they can revise meaningfully before a teacher ever sees the draft.

## 2. Objective

Students submit essays against a rubric. The AI grades each essay with inline comments on structure, argument strength, and grammar, and the app displays a score breakdown by rubric category alongside a revision-tracking view that compares drafts over time.

DraftLoop supports this complete workflow:

1. A teacher or student selects (or creates) a rubric.
2. The student submits an essay tied to that rubric.
3. Gemini evaluates the essay against the selected rubric.
4. The system returns category scores, an overall score, strengths, next steps, and inline comments.
5. The student saves multiple drafts of the same essay.
6. The student compares drafts and sees how scores and feedback changed.
7. The assigned teacher inspects the submission and records review overrides.

---

## 3. Core Features (Must-Have)

### 3.1 Rubric creation and selection

- Teachers (or students, for demo simplicity) can create custom rubrics.
- Each rubric defines categories (for example Structure, Argument Strength, Grammar, Clarity), a description for each category, and a maximum point value per category. Category maximums act as the weights that make up the total score.
- Reusable rubric templates can be selected instead of building a rubric from scratch.
- Built-in templates:
  - Argumentative Essay
  - Narrative Essay
  - Explanatory Essay

### 3.2 Essay submission

- Students paste essay text into the student workspace.
- Every essay is tied to a specific rubric.
- Assignment instructions can be added for context.
- Students assign an available teacher to the essay.
- Essay length is limited by `MAX_ESSAY_CHARACTERS` (default 30,000).

### 3.3 AI grading against the rubric

- Gemini grades every rubric category independently and assigns a score for each.
- Scores are constrained by each category's maximum points.
- The full rubric is sent with every grading request, so criteria stay consistent across drafts.
- Structured JSON output is validated before an assessment is saved.
- Invalid AI output is retried and rejected safely if validation still fails.

### 3.4 Inline comments

AI-generated comments are attached to specific sentences and paragraphs of the essay and flag structural issues, weak arguments, or grammar problems. Comment types:

- Structure
- Argument strength
- Evidence
- Grammar
- Clarity

Each comment includes:

- A severity level
- A suggested improvement
- An exact paragraph reference and quoted text from the essay

Invalid or fabricated quotes are removed before feedback is saved, so every comment points at real text in the draft.

### 3.5 Score breakdown view

The feedback page displays:

- The score for every rubric category, with its maximum points
- The overall total and maximum possible score
- Overall feedback
- Strengths
- Prioritized next steps
- Teacher review history

### 3.6 Draft submission and storage

- Students can submit multiple drafts of the same essay over time.
- Drafts are numbered and stored in Supabase.
- Every draft keeps its own content, reflection, AI assessment, and feedback.
- Earlier drafts and assessments are always preserved.

### 3.7 Revision-tracking view

- Compare any two drafts from the same essay.
- Compare total scores and category scores.
- Review how feedback changed between drafts.
- View the exact text that was added and removed (see 4.1).

---

## 4. Stretch Features

### 4.1 Diff-style text comparison

The comparison view highlights the exact text changes between two drafts, showing added and removed text, not just score changes.

### 4.2 Teacher dashboard with overrides

Teachers can:

- View all assigned student submissions and their AI-generated grades at a glance.
- Inspect draft history.
- View AI score breakdowns and inline comments.
- Override category scores and add a review reason.
- Keep AI scores and teacher reviews stored separately.
- Review score history for each submission.

Only teachers assigned to a student can access that student's essays.

### 4.3 Progress visualization

Students can view:

- Score trend charts across drafts
- Category-level progress
- Draft status
- Latest feedback
- Improvement over time

### 4.4 Custom rubric templates

Preset templates (Argumentative, Narrative, Explanatory) give teachers and students a starting point. Templates can be selected as-is or used as the basis for a custom rubric.

---

## 5. Authentication and Authorization

DraftLoop uses Supabase Authentication and PostgreSQL Row Level Security.

Supported roles:

- Student
- Teacher

Security rules include:

- Students can access only their own essays and drafts.
- Teachers can access only assigned student submissions.
- Teacher review writes are validated by database functions.
- Rubric ownership is enforced by Supabase policies.
- AI and Supabase secret keys remain on the backend.
- Frontend requests use authenticated Supabase access tokens.
- Anonymous database access is revoked.

---

## 6. How DraftLoop Handles the Key Challenges

| Challenge | Approach |
| --- | --- |
| Mapping AI comments to exact locations in the essay | The model is asked to quote the exact sentence or phrase it is commenting on. The backend checks each quote against the original essay, including paragraph index and quote occurrence, and removes any comment whose quote cannot be matched. |
| Consistent, fair scores across drafts | The full rubric text is sent with every grading request. Nothing depends on the model remembering a previous session. |
| Reliable structured JSON output | The model is asked for structured JSON. The response is validated against the rubric and schema, malformed output is retried, and results that still fail validation are rejected instead of saved. |
| A clean revision view without overengineering | The revision view centers on a side-by-side score comparison and feedback changes, with a text diff layered on top. |

---

## 7. Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React (Vite), React Router, Supabase Auth client, Recharts, responsive CSS |
| Backend | Python, FastAPI, Pydantic, HTTPX, Supabase Python client |
| AI model | Gemini API (default `gemini-2.5-flash`), configured with `AI_PROVIDER` and `GEMINI_MODEL` |
| Text diffing | Python `difflib` (standard library, no external service) |
| Database | Supabase Authentication, Supabase PostgreSQL, Row Level Security, PostgreSQL functions and triggers |
| Hosting | Vercel (frontend), Render (FastAPI backend), Supabase (auth and database) |

---

## 8. Project Structure

```text
draftloop/
├── backend/
│   ├── app/
│   │   ├── auth.py
│   │   ├── comparison.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── grading.py
│   │   ├── main.py
│   │   ├── routes.py
│   │   ├── schemas.py
│   │   └── templates.py
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   └── package.json
├── supabase/
│   ├── schema.sql
│   ├── grading.sql
│   └── admin_setup.sql
├── render.yaml
└── README.md
```

---

## 9. Setup

### Supabase

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run the files in this order:

```text
supabase/schema.sql
supabase/grading.sql
supabase/admin_setup.sql
```

4. Enable email authentication.
5. Create one student account and one teacher account.
6. Confirm both email addresses.
7. Assign the teacher to the student through the `teacher_students` table.
8. Add the Supabase URL and keys to the backend and frontend environment files.

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
AI_TIMEOUT_SECONDS=90

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_publishable_key_here
SUPABASE_SECRET_KEY=your_secret_key_here
SUPABASE_TIMEOUT_SECONDS=20

CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
MAX_ESSAY_CHARACTERS=30000
```

Start the backend:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```text
http://127.0.0.1:8000/api/health
```

The health response should report:

```json
{
  "status": "ok",
  "ai_configured": true,
  "ai_provider": "gemini"
}
```

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key_here
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_API_TIMEOUT_MS=15000
VITE_GRADING_TIMEOUT_MS=120000
```

Start the frontend:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

---

## 10. Testing with Sample Data

- **Sample rubrics:** use the built-in Argumentative, Narrative, and Explanatory templates, or create your own mock rubrics in the rubric editor.
- **Sample essays:** for realistic test essays, use publicly available student essay datasets such as the Kaggle "Automated Essay Scoring" dataset or the Hewlett Foundation ASAP (Automated Student Assessment Prize) dataset.
- **Recommended test pass:** run two or three sample essays through the full flow, and for at least one, submit a deliberately flawed first draft followed by a revised second draft to confirm that scores, inline comments, and the comparison view behave as expected.
- **Text diffing:** no external API is needed. Draft comparison runs locally in the backend.

---

## 11. Demo Flow

A strong demo shows a real, slightly flawed essay graded against a visible rubric, feedback that engages with specific sentences rather than generic advice, and a revised draft that visibly improves.

1. Sign in as a student.
2. Select or create a rubric and show its categories and point values.
3. Create an essay and assign a teacher.
4. Submit a slightly flawed first draft.
5. Start AI grading.
6. Show the category score breakdown and overall total.
7. Show inline structure, argument, and grammar comments pointing at specific sentences.
8. Revise the essay by addressing the AI's inline feedback.
9. Submit and grade a second draft.
10. Open the revision comparison view.
11. Show the changed text, the score improvement, and the change in feedback.
12. Show the progress chart of scores across drafts.
13. Sign in as the teacher.
14. Open the assigned submission and record a category score override with a review reason.
15. Return to the student account and show the saved teacher review.

Points to emphasize:

- **Speed:** feedback arrives in seconds instead of days.
- **Specificity:** comments quote the exact text they refer to, like feedback from an attentive teacher.
- **Visible improvement:** the strongest moment is a weak essay improving in score after the student addresses the inline feedback.

---

## 12. Deployment

### Backend on Render

Use:

```text
Root Directory: backend
Build Command: pip install -r requirements.txt
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /api/health
```

Configure the Gemini and Supabase environment variables in Render. Set `CORS_ORIGINS` to the deployed Vercel frontend URL.

### Frontend on Vercel

Use:

```text
Root Directory: frontend
Build Command: npm run build
Output Directory: dist
```

Configure:

```dotenv
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_API_BASE_URL
VITE_API_TIMEOUT_MS
VITE_GRADING_TIMEOUT_MS
```

Set `VITE_API_BASE_URL` to the deployed Render backend URL.

---

## 13. Validation and Reliability

DraftLoop validates:

- Rubric category IDs
- Category score limits
- Duplicate categories
- Essay length
- Draft content
- Exact evidence quotes
- Paragraph indexes
- Quote occurrences
- Teacher review totals
- AI response structure

The backend uses retry handling, request timeouts, structured errors, and atomic grading database functions.

---

## 14. Security

Never commit these files:

```text
backend/.env
frontend/.env
```

Never commit:

- Gemini (or other AI provider) API keys
- Supabase secret keys
- Access tokens
- Service-role credentials

Only publishable Supabase keys may be used in the frontend.

---

## 15. Requirements Coverage

### Core features (must-have)

| Requirement | DraftLoop implementation |
| --- | --- |
| Rubric creation/selection | Custom rubric editor with categories, descriptions, and point values, plus reusable templates |
| Essay submission | Student essay workspace with pasted text, tied to a selected rubric |
| AI grading against rubric | Gemini rubric-based structured grading with a score for every category |
| Inline comments | Exact paragraph and quote-linked comments on structure, argument, evidence, grammar, and clarity |
| Score breakdown view | Category score cards, overall total, and maximum scores |
| Draft submission and storage | Persistent numbered drafts in Supabase, each with its own assessment and feedback |
| Revision-tracking view | Comparison of any two drafts: total scores, category scores, and feedback changes |

### Stretch features

| Requirement | DraftLoop implementation |
| --- | --- |
| Diff-style text comparison | Added and removed text highlighted between drafts |
| Teacher dashboard | Assigned-submission dashboard with AI grades and draft history |
| Teacher score override | Verified category score reviews with a review reason, stored separately from AI scores |
| Progress visualization | Score trend and category progress charts across drafts |
| Custom rubric templates | Argumentative, Narrative, and Explanatory templates |

### Platform requirements

| Requirement | DraftLoop implementation |
| --- | --- |
| Authentication | Supabase email authentication |
| Authorization | Role checks, ownership checks, and Row Level Security |
| Deployment | Vercel frontend and Render backend |

---

## 16. Future Improvements

- Essay file upload with PDF and DOCX text extraction
- Teacher-created classes
- Bulk student enrollment
- Assignment deadlines
- Rubric version history
- Export feedback as PDF
- Plagiarism and citation support through separate verified services
- Institution-level analytics

## License

This project was created as an educational hackathon project.