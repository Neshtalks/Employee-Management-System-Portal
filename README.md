# Employee Management System (EMS)

An on-premise, full-stack Employee Management System designed for tracking employee work hours, tasks, breaks, and leave requests. It features role-based access control for Employees, Managers, and Administrators, and is built with a Node.js backend and a modern vanilla JavaScript front-end.



## Features

-   **Role-Based Access Control:**
    -   **Employee:** Can clock in/out, manage daily tasks, take breaks, and request leave.
    -   **Manager:** Can view detailed performance reports for their team, export data, and approve/reject leave requests.
    -   **Administrator:** Can create/manage all users and configure their access permissions.
-   **Real-Time Dashboard:** Employees see a live-updating dashboard showing their current status (On Task, On Break, Idle), and total work, task, and break times for the day.
-   **Comprehensive Reporting:** Managers can generate detailed reports for any employee over any date range, including a chronological activity timeline and task summary.
-   **Excel Export:** All reports can be exported to a multi-sheet `.xlsx` file for offline analysis and record-keeping.
-   **User-Specific IP Restrictions:** Admins can define a list of allowed IP addresses for each employee and manager, preventing logins from unauthorized networks.
-   **On-Premise Ready:** Built to run on a local server with a professional-grade PostgreSQL database for data security and integrity.

---

## Technology Stack

-   **Backend:** Node.js, Express.js
-   **Database:** PostgreSQL
-   **Authentication:** JSON Web Tokens (JWT)
-   **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
-   **Key Libraries:** `pg` (for PostgreSQL), `jsonwebtoken`, `xlsx` (for Excel export)

---

## On-Premise Setup and Installation

Follow these steps to set up and run the application on a local server.

### Prerequisites

-   [Node.js](https://nodejs.org/) (v16 or later recommended)
-   [PostgreSQL](https://www.postgresql.org/download/) (v14 or later recommended)
-   A command-line terminal (like PowerShell, Command Prompt, or Terminal)
-   [pgAdmin 4](https://www.pgadmin.org/download/) (usually included with the PostgreSQL installer)

### 1. Database Setup

First, you need to create a dedicated database for the application.

1.  **Install PostgreSQL:** Follow the official installer for your server's operating system. During installation, you will be prompted to set a password for the default superuser, `postgres`. **Remember this password.**
2.  **Open pgAdmin 4:** Launch the pgAdmin application.
3.  **Connect to Server:** Double-click the server instance (e.g., "PostgreSQL 16") and enter the password you created.
4.  **Create the Database:**
    -   Right-click on **Databases** in the left-hand browser.
    -   Select **Create -> Database...**.
    -   Enter the database name: `ems_db`
    -   Click **Save**.

### 2. Application Setup

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/your-username/ems-final.git
    cd ems-final
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Configure the Database Connection:**
    -   Open the `server.js` file in a code editor.
    -   Find the `CONNECTION_STRING` constant near the top of the file.
    -   Replace `"YOUR_PASSWORD_HERE"` with the actual password you set for the `postgres` user.
    
    ```javascript
    // Example from server.js
    const CONNECTION_STRING = "postgres://postgres:YourActualPassword123@localhost:5432/ems_db"; 
    ```

### 3. Running the Application

1.  **Start the Server:**
    ```bash
    npm start
    ```
    The first time you run this, the application will automatically create all the necessary tables in your `ems_db` database and seed the initial administrator account. You should see output like this:
    ```
    Connected to local PostgreSQL database
    Tables created and checked successfully.
    Seeding database with default admin user...
    Server running at http://localhost:3000
    ```

2.  **Access the Application:**
    -   Open a web browser and navigate to `http://localhost:3000`.

---

## How to Use the System

### Initial Login and Setup

1.  **Log in as Admin:**
    -   **Username:** `admin`
    -   **Password:** `admin123`
2.  **Navigate to User Management:**
    -   You will be taken to the admin dashboard.
3.  **Create a New User (e.g., an Employee):**
    -   Fill out the "Create New User" form.
    -   **For testing on your local machine,** in the "Allowed IPs" field, enter `::1`. This is the IP address for `localhost`.
    -   Click "Create User".
4.  **Log Out** of the admin account.
5.  **Log In as the New Employee** with the credentials you just created. You should now see the employee dashboard.

### IP Address Management

-   The **Allowed IPs** field for each user controls where they can log in from.
-   It accepts a comma-separated list of IP addresses (e.g., `192.168.1.100, 192.168.1.101, ::1`).
-   If the field is left **empty**, that user can log in from **any IP address**.
-   The **Admin** role is exempt from all IP restrictions to prevent being locked out.

### Running in Production

To run this application continuously on an on-premise server, it is highly recommended to use a process manager like `pm2`.

1.  **Install `pm2` globally:**
    ```bash
    npm install pm2 -g
    ```
2.  **Start the application with `pm2`:**
    ```bash
    pm2 start server.js --name "ems-app"
    ```
3.  **Enable Startup on Reboot:**
    ```bash
    pm2 startup
    ```
    This command will generate another command that you need to run. Copy and paste that command to enable the startup script.
4.  **Save the current process list:**
    ```bash
    pm2 save
    ```

Now, your EMS application will run in the background and automatically restart if it crashes or if the server reboots. You can monitor it with `pm2 list` and view logs with `pm2 logs ems-app`.
