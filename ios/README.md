# iOS

This directory contains the native SwiftUI client for the Bissbilanz platform.

## Project structure

- `Bissbilanz/` – Application sources, resources and configuration files.
- `Bissbilanz.xcodeproj/` – Xcode project containing the build settings for the iOS app.

## Running the app

1. Start the Go backend so the login endpoint is available:
   ```bash
   cd backend
   PORT=3000 go run ./cmd/server
   ```
2. Open `ios/Bissbilanz/Bissbilanz.xcodeproj` in Xcode 15 or newer.
3. Select the *Bissbilanz* scheme and a simulator or device target.
4. Build and run. Use the demo credentials defined in the backend configuration
   (defaults: `demo@bissbilanz.ch` / `password123`).

The login screen sends the email and password to `POST /auth/login` and displays
either the returned token and user information or an error message.
