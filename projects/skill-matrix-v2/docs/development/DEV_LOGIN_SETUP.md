# Dev Login Feature Setup

## Overview

The dev login feature allows Admin users to login as any employee in development mode for testing purposes. This feature is restricted to users with the **Admin** role for security.

## How It Works

1. **User must login via SSO first**: The dev login button only appears if:
   - The app is running in development mode (localhost/127.0.0.1)
   - The user is logged in via SSO
   - The user has the **Admin** role in the database

2. **Authorization Check**: When a user tries to use dev login:
   - The system checks if the user's role is "admin" (case-insensitive)
   - If not authorized, they see an "Access Denied" message
   - If authorized, they can enter any employee's email to view their dashboard

3. **Security**: 
   - Dev login is only available in development mode
   - Requires SSO authentication first (to verify identity)
   - Only users with Admin role can use the feature
   - The feature is completely disabled in production builds

## Accessing Dev Login

1. Login via SSO with an account that has Admin role
2. Click on your profile avatar (top right)
3. Click "🧪 Dev Login" from the dropdown menu
4. Enter any employee's email address
5. Click "Login as Employee" or press Enter
6. The modal will close automatically and you'll see the employee's dashboard

## How It Works

When you enter an employee's email and click "Login as Employee":
- The system creates a mock JWT token with the entered email
- Calls `save_employee_v2` which fetches the actual employee data from the database
- Updates your session to show that employee's information
- You'll see their dashboard, skills, certificates, and all their data

## Troubleshooting

### Dev Login Button Not Showing

1. **Check if you're in development mode**: The button only appears on `localhost` or `127.0.0.1`
2. **Check if you're logged in**: You must login via SSO first
3. **Check your role**: Your account must have "Admin" role in the database
4. **Verify role in database**: Check the `employee` table to ensure your role is set to "admin"

### "Access Denied" Message

- Your account does not have Admin role
- Your role in the database is not set to "admin"
- Contact your administrator to update your role in the database

## Setting Admin Role

To grant a user Admin role, update the database:

```sql
UPDATE skill_matrix_v2_dev.employee 
SET role = 'admin' 
WHERE LOWER(email) = LOWER('user@jktech.com');
```

## Security Notes

- Only users with Admin role can access this feature
- The role is checked from the database (via `save_employee_v2` response)
- No environment variables or configuration files needed
- Role-based access is more secure and maintainable than email allowlists
- The authorization check uses the original admin user's role, not the employee you're logging in as

## Removing Access

To remove access for a specific employee, simply update their role in the database:

```sql
UPDATE skill_matrix_v2_dev.employee 
SET role = 'employee' 
WHERE LOWER(email) = LOWER('user@jktech.com');
```
