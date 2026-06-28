<img width="1919" height="966" alt="Screenshot 2026-06-29 013455" src="https://github.com/user-attachments/assets/97a8b8e1-6247-4417-92a3-fa416a7cb00e" />Interview Partner – AI Powered Interview Preparation Platform

Practice technical, HR, and behavioral interviews with an AI-powered interview assistant.

Interview Partner is a full-stack interview preparation platform that simulates real interview experiences through text, voice, and virtual interview modes. It provides resume-aware question generation, adaptive follow-up questions, AI-powered evaluation, coding interviews, performance analytics, and personalized learning recommendations.

Live Demo: https://interview-partner-orcin.vercel.app/

Table of Contents

Features
Authentication
Interview Modes
Resume-Based Interviews
Coding Interviews
AI Evaluation & Feedback
Dashboard & Analytics
System Architecture Overview
High Level Architecture
Interview Workflow
AI Agent System
Design Decisions
UI/UX
Tech Stack
Getting Started
Clone & Install
Environment Variables
Run Development Servers
Deployment
Future Improvements
License
Contact


Features

Authentication

User registration and login
JWT-based authentication
Secure password management
Protected routes
User profile management


Interview Modes

Interview Partner supports multiple interview experiences.

Text Interview
AI-generated interview questions
Adaptive follow-up questions
Real-time answer evaluation

Voice Interview
Speech-to-Text conversation
AI voice responses
Natural interview interaction
Live transcription

Virtual Interview
Camera-enabled interviews
Face detection
Tab-switch monitoring
Microphone monitoring
Browser activity tracking
<img width="1919" height="974" alt="Screenshot 2026-06-29 013603" src="https://github.com/user-attachments/assets/4cc424d3-1661-4340-9fff-61e36d5fb121" />


Resume-Based Interviews

Users can upload their resume before starting an interview.

The AI extracts:

* Skills
* Technologies
* Projects
* Work Experience
* Certifications

Interview questions are dynamically generated based on the uploaded resume.

Coding Interviews

Coding interviews include:

* Built-in code editor
* Python support
* JavaScript support
* AI code evaluation
* Complexity analysis
* Coding feedback
<img width="1919" height="963" alt="Screenshot 2026-06-29 013730" src="https://github.com/user-attachments/assets/756a3cd8-a43c-42d6-85f7-b9bbe550924f" />

AI Evaluation & Feedback

After every interview the platform generates a comprehensive performance report including:

* Overall Score
* Technical Knowledge
* Communication Skills
* Problem Solving
* Confidence
* Grammar & Clarity
<img width="1919" height="976" alt="Screenshot 2026-06-29 013813" src="https://github.com/user-attachments/assets/de76616e-0aa3-4e74-b7bd-b9b280c863cb" />

The report also includes:

* Strengths
* Areas for Improvement
* Question-wise Feedback
* Personalized Learning Recommendations

Dashboard & Analytics

The dashboard allows users to:

* View interview history
* Track performance over time
* Analyze score trends
* Review previous reports
* Monitor skill improvement
* <img width="1919" height="975" alt="Screenshot 2026-06-29 013533" src="https://github.com/user-attachments/assets/dc3565cd-867d-4a1d-9f4d-d77a15dc4e2d" />


 System Architecture Overview

Interview Partner combines modern web technologies with AI services to create an adaptive interview platform.

High Level Architecture

```
User
        │
        ▼
React Frontend
        │
        ▼
FastAPI Backend
        │
        ▼
LangGraph Agent System
        │
        ▼
Groq / Gemini
        │
        ▼
PostgreSQL Database
```

 Interview Workflow


User Login

↓

Create Interview

↓

Upload Resume (Optional)

↓

Select Interview Mode

↓

AI Generates Question

↓

User Responds

↓

AI Evaluates Response

↓

Adaptive Follow-up

↓

Interview Completion

↓

Performance Report

↓

Dashboard

 AI Agent System

The platform uses multiple AI agents that collaborate during an interview.

| Agent                | Responsibility                               |
| -------------------- | -------------------------------------------- |
| Interview Planner    | Creates interview flow                       |
| Resume Analyzer      | Extracts resume information                  |
| Question Generator   | Generates interview questions                |
| Evaluation Agent     | Scores candidate responses                   |
| Follow-up Agent      | Generates contextual follow-up questions     |
| Report Generator     | Creates the final interview report           |
| Recommendation Agent | Generates personalized study recommendations |

 Design Decisions

* Voice and virtual interviews provide a realistic interview experience.
* Resume-aware interviews personalize questions for every candidate.
* Adaptive questioning adjusts interview difficulty based on previous responses.
* Modular AI agents simplify future expansion.
* PostgreSQL stores interview history and reports.
* FastAPI provides scalable backend APIs.
* React delivers a responsive single-page application.

UI/UX

The interface is designed to provide a distraction-free interview experience.

Key design principles include:

* Clean interface
* Responsive design
* Simple navigation
* Real-time feedback
* Accessible components
* Dark and Light mode support


Tech Stack

 Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* ShadCN UI
* Framer Motion

Backend

* FastAPI
* Python
* SQLAlchemy
* PostgreSQL
* Alembic

AI

* LangChain
* LangGraph
* Groq API
* Google Gemini API

Voice

* Web Speech API

Authentication

* JWT Authentication

Deployment

* Vercel
* Render 


Getting Started

Clone & Install
git clone https://github.com/yourusername/interview-partner.git

cd interview-partner

npm install


Environment Variables

Backend

DATABASE_URL=

SECRET_KEY=

GROQ_API_KEY=

GEMINI_API_KEY=
Frontend

VITE_API_URL=

VITE_BACKEND_URL=
Run Development Servers

Frontend


npm run dev


Backend

uvicorn app.main:app --reload
Deployment

Frontend

* Vercel

Backend

* Render 

Database

* PostgreSQL

Future Improvements

* Company-specific interview templates
* AI video interviews
* Emotion analysis
* Multi-language support
* Resume ATS analysis
* Mock group discussions
* Interview scheduling
 License

This project is licensed under the MIT License.
 Contact

Sanjaya M

GitHub: [https://github.com/Sanjaya1822](https://github.com/Sanjaya1822)

LinkedIn: linkedin.com/in/sanjaya-m-085738349
Email: san9345420@gmail.com
