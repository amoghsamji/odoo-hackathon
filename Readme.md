# 🌍 EcoSphere: ESG Management Platform
> Integrate Environmental, Social and Governance (ESG) management directly into day-to-day ERP operations.

![Odoo](https://img.shields.io/badge/Odoo-Hackathon-714B67?style=for-the-badge&logo=odoo&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.x-blue?style=for-the-badge&logo=python)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## 📌 Problem Statement

Environmental, Social and Governance (ESG) has become a critical aspect of modern businesses. Organizations are expected to monitor carbon emissions, promote employee well-being, and maintain governance compliance. While many ERP systems collect operational data, ESG reporting is often manual, disconnected, and difficult to monitor in real time.

---

## 💡 Solution

EcoSphere integrates ESG directly into day-to-day ERP operations by measuring sustainability metrics, encouraging employee participation, and providing meaningful reports for management. It enables organizations to measure, manage and improve their Environmental, Social and Governance performance by bringing operational data, employee participation and compliance activities into a single unified dashboard.

- Unifies Environmental, Social and Governance data in one platform
- Automates carbon emission calculation from existing ERP transactions
- Drives employee engagement through CSR activities and gamification (challenges, XP, badges, rewards, leaderboards)
- Tracks governance policies, audits and compliance issues end-to-end
- Generates real-time, filterable, and exportable ESG reports for management

---

# ✨ Features

### 🌱 Environmental
- ✅ Configure Emission Factors
- ✅ Calculate Carbon Emissions (manual or automatic)
- ✅ Department Carbon Tracking
- ✅ Sustainability Goals
- ✅ Environmental Dashboard

### 🤝 Social
- ✅ CSR Activities
- ✅ Employee Participation
- ✅ Diversity Metrics
- ✅ Training Completion

### 🏛️ Governance
- ✅ ESG Policies
- ✅ Policy Acknowledgements
- ✅ Audits
- ✅ Compliance Issues (with Owner, Due Date & overdue flagging)

### 🎮 Gamification
- ✅ Challenges (Draft → Active → Under Review → Completed / Archived lifecycle)
- ✅ XP System
- ✅ Auto-Awarded Badges (based on Unlock Rules)
- ✅ Rewards Catalog & Redemption
- ✅ Leaderboards

### ⚙️ Settings & Administration
- ✅ Departments Management
- ✅ Category Management
- ✅ ESG Configuration & Business Rules
- ✅ Notification Settings (in-app / email)

### 📊 Reports
- ✅ Environmental Report
- ✅ Social Report
- ✅ Governance Report
- ✅ ESG Summary Report
- ✅ Custom Report Builder (filter by Department, Date Range, Module, Employee, Challenge, ESG Category — export as PDF / Excel / CSV)

---

## 🏗️ Tech Stack

### Frontend
- HTML
- CSS
- JavaScript
- Bootstrap

### Backend
- Python
- Odoo Framework

### Database
- PostgreSQL

### AI / ML (if applicable)
- OpenAI API
- Hugging Face
- LangChain

### Deployment
- Docker
- Odoo Server

---

# 📂 Project Structure

```
ecosphere-esg-platform/
│
├── addons/
│   └── ecosphere_esg/
│       ├── models/
│       │   ├── department.py
│       │   ├── category.py
│       │   ├── emission_factor.py
│       │   ├── product_esg_profile.py
│       │   ├── environmental_goal.py
│       │   ├── esg_policy.py
│       │   ├── badge.py
│       │   ├── reward.py
│       │   ├── carbon_transaction.py
│       │   ├── csr_activity.py
│       │   ├── employee_participation.py
│       │   ├── challenge.py
│       │   ├── challenge_participation.py
│       │   ├── policy_acknowledgement.py
│       │   ├── audit.py
│       │   ├── compliance_issue.py
│       │   └── department_score.py
│       ├── views/
│       ├── security/
│       ├── reports/
│       └── static/
│
├── static/
│
├── templates/
│
├── screenshots/
│
├── docs/
│
├── requirements.txt
├── docker-compose.yml
├── README.md
└── LICENSE
```

---

## 🗂️ Data Model

### Master Data

| Model | Purpose | Key Fields |
|---|---|---|
| Department | Organizational hierarchy and ESG ownership | Name, Code, Head, Parent Department, Employee Count, Status |
| Category | Shared category values used across Social and Gamification modules | Name, Type (CSR Activity / Challenge), Status |
| Emission Factor | Carbon values used during calculations | — |
| Product ESG Profile | ESG information linked to products | — |
| Environmental Goal | Sustainability targets | — |
| ESG Policy | Governance policies | — |
| Badge | Employee achievements | Name, Description, Unlock Rule, Icon |
| Reward | Redeemable incentives | Name, Description, Points Required, Stock, Status |

### Transactional Data

| Model | Purpose | Key Fields |
|---|---|---|
| Carbon Transaction | Stores calculated emissions from ERP operations | — |
| CSR Activity | Social initiatives organized by the company | — |
| Employee Participation | Tracks employee involvement in CSR Activities only | Employee, Activity, Proof, Approval Status, Points Earned, Completion Date |
| Challenge | Sustainability challenges | Title, Category, Description, XP, Difficulty, Evidence Required, Deadline, Status |
| Challenge Participation | Tracks employee progress within Challenges only | Challenge, Employee, Progress, Proof, Approval, XP Awarded |
| Policy Acknowledgement | Employee policy acceptance | — |
| Audit | Governance audits | — |
| Compliance Issue | Governance violations | Audit, Severity, Description, Owner, Due Date, Status |
| Department Score | Aggregated ESG performance per department | Department, Environmental Score, Social Score, Governance Score, Total Score |

---

## 🔄 Business Workflow

```
Master Configuration
        │
        ▼
Departments · Categories · Emission Factors · Products
Goals · Policies · Challenges
        │
        ▼
Daily Business Operations
(Purchase • Manufacturing • Expenses • Fleet)
        │
        ▼
Carbon Transactions
        │
        ▼
Employee Participation (CSR) · Challenge Participation
Policy Acknowledgements · Audits
        │
        ▼
Environmental Score   Social Score   Governance Score
        │
        ▼
Department Total Score
        │
        ▼
Overall ESG Score
(weighted average of Department Total Scores — default weighting:
Environmental 40% / Social 30% / Governance 30%, configurable per organization)
        │
        ▼
Organization Dashboard & Reports
```

---

## ⚖️ Core Configuration & Business Rules

The following are in scope, not optional, since they directly support the core modules:

- **Reward Redemption** — Employees can redeem earned Points/XP for a Reward from the catalog, subject to stock availability. Redeeming a Reward deducts the corresponding Points from the employee's balance.
- **Notification System** — Sends in-app and/or email notifications for: new compliance issues raised, CSR/Challenge approval decisions, policy acknowledgement reminders, and badge unlocks. Configurable via Settings → Notification Settings.
- **Auto Emission Calculation** — When enabled, Carbon Transactions are calculated automatically from linked Purchase/Manufacturing/Expense/Fleet records using the relevant Emission Factor — no manual entry required.
- **Evidence Requirement** — When enabled, CSR Activity participation cannot be marked Approved without an attached proof file.
- **Badge Auto-Award** — When enabled, a Badge is automatically assigned to an employee the moment their XP, completed-challenge count, or other tracked metric satisfies that Badge's Unlock Rule — no manual admin action required.
- **Compliance Issue Ownership** — Every Compliance Issue must have an assigned Owner and a Due Date; issues that pass their Due Date while still Open are flagged and feed the Notification System.

---

# ⚙️ Installation

### Clone Repository
```bash
git clone https://github.com/yourusername/ecosphere-esg-platform.git
cd ecosphere-esg-platform
```

### Create Virtual Environment
```bash
python -m venv venv
```

Windows
```bash
venv\Scripts\activate
```

Linux/Mac
```bash
source venv/bin/activate
```

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Run Odoo
```bash
python odoo-bin
```

---

# 🚀 Usage

1. Start the Odoo server.
2. Install the EcoSphere ESG custom module.
3. Open the application in your browser.
4. Configure Departments, Categories, and Emission Factors under Settings.
5. Explore the Environmental, Social, Governance and Gamification modules.
6. Generate reports from the Reports menu (or build a custom one via the Report Builder).

---

# 📸 Screenshots

| Home | Dashboard |
|------|-----------|
| Add screenshot | Add screenshot |

| Environmental | Social |
|------|-----------|
| Add screenshot | Add screenshot |

| Governance | Gamification |
|------|-----------|
| Add screenshot | Add screenshot |

---

# 🎥 Demo

Video Demo:
```
https://youtu.be/your-demo-video
```

Live Demo:
```
https://your-demo-link.com
```

Mockup:
```
https://link.excalidraw.com/l/65VNwvy7c4X/2m6lz9Ln4
```

---

# 👥 Team

| Name | Role |
|------|------|
| Your Name | Full Stack Developer |
| Member 2 | Backend |
| Member 3 | Frontend |
| Member 4 | AI/ML |

---

# 🛣️ Future Scope (Bonus Ideas)

- Department ESG rankings
- Smart dashboard visualizations
- Mobile-responsive interface
- AI-powered ESG recommendations
- Cloud deployment
- Advanced predictive analytics
- Third-party ERP integrations

---

# 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch
```bash
git checkout -b feature-name
```
3. Commit changes
```bash
git commit -m "Added new feature"
```
4. Push
```bash
git push origin feature-name
```
5. Open a Pull Request

---

# 📜 License

This project is licensed under the MIT License.

---

# ❤️ Acknowledgements

- Odoo
- Odoo Hackathon
- Open Source Community
- Contributors

---

## ⭐ If you like this project, don't forget to star the repository!