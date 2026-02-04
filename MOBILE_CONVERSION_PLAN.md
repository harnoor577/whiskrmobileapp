# Whiskr.ai Mobile App - Complete Conversion Plan

## Overview
Converting the Lovable web app (269 files, 20,521 lines of page code) to a native Expo mobile app.

---

## Phase 1: Foundation & Authentication ✅ COMPLETED
- [x] Expo project setup
- [x] Supabase integration
- [x] Auth store (Zustand)
- [x] Login screen (email/password)
- [x] Google OAuth (configured)
- [x] Forgot password
- [x] Remove signup (sign-in only)

---

## Phase 2: Core Layout & Navigation (Current)
Match the web app's mobile layout exactly.

### 2.1 Mobile Bottom Navigation
- [ ] Home (Dashboard)
- [ ] Patients  
- [ ] **Center FAB: New Consult** (prominent green button)
- [ ] Settings
- [ ] Sign Out

### 2.2 Dashboard Screen
- [ ] Greeting with user name & time-based icon
- [ ] Stats cards (Patients count, Consults this week, Time saved)
- [ ] Quick actions (Start Consult button)
- [ ] Recent patients list
- [ ] Consult usage indicator (if on capped plan)

---

## Phase 3: Patient Management

### 3.1 Patients List
- [ ] Search/filter functionality
- [ ] Species icons (Dog, Cat, Bird, etc.)
- [ ] Pull to refresh
- [ ] Patient cards with name, species, breed, owner

### 3.2 Patient Detail
- [ ] Patient info card (name, species, breed, weight, age)
- [ ] Owner info (name, phone, email)
- [ ] Visit timeline
- [ ] Medical history
- [ ] Case summary
- [ ] Diagnostics section
- [ ] Start consult from patient

### 3.3 Add/Edit Patient
- [ ] Patient form (all fields)
- [ ] Species picker
- [ ] Owner information
- [ ] Medical history input

---

## Phase 4: Consultation Workflow (Core Feature)

### 4.1 Quick Consult Dialog
- [ ] Patient selector (search existing or quick add)
- [ ] Chief complaint input
- [ ] Start consultation button

### 4.2 Consult Workspace
- [ ] Patient header with info
- [ ] Chief complaint display
- [ ] **Voice Recorder** (Eleven Labs integration)
  - Record button
  - Waveform visualization
  - Transcription display
- [ ] Transcript editor
- [ ] Generate SOAP button
- [ ] Navigation to editors

### 4.3 SOAP Editor
- [ ] Subjective section (editable)
- [ ] Objective section (editable)
- [ ] Assessment section (editable)
- [ ] Plan section (editable)
- [ ] AI regenerate buttons
- [ ] Copy to clipboard
- [ ] Save/Update functionality

### 4.4 Wellness Editor
- [ ] AI-generated wellness plan
- [ ] Edit functionality
- [ ] Copy/Save

### 4.5 Procedure Editor
- [ ] AI-generated procedure notes
- [ ] Edit functionality
- [ ] Copy/Save

### 4.6 Case Summary
- [ ] Complete consultation overview
- [ ] All generated notes
- [ ] Export options
- [ ] Finalize consultation

---

## Phase 5: Consults List & History

### 5.1 Consults List
- [ ] Filter by status (draft, in_progress, completed, finalized)
- [ ] Search functionality
- [ ] Patient name display
- [ ] Date/time display
- [ ] Status badges
- [ ] Quick resume consult

---

## Phase 6: Additional Features

### 6.1 Messages
- [ ] Conversation list
- [ ] Message thread view
- [ ] Send message
- [ ] Real-time updates
- [ ] Unread badge count

### 6.2 Tasks
- [ ] Task list
- [ ] Create task
- [ ] Mark complete
- [ ] Filter by status

### 6.3 Diagnostics
- [ ] Diagnostic files list
- [ ] File preview
- [ ] Link to consult

### 6.4 Templates
- [ ] My templates list
- [ ] Library templates
- [ ] Use template in consult

---

## Phase 7: Settings & Account

### 7.1 Account Settings
- [ ] Profile editing (name, prefix)
- [ ] Password change
- [ ] Notification preferences
- [ ] Theme toggle (dark/light)
- [ ] Active devices list
- [ ] Login history

### 7.2 Clinic Switcher (if multi-clinic)
- [ ] Clinic list
- [ ] Switch clinic functionality

---

## Phase 8: AI Integrations

### 8.1 Eleven Labs (Voice)
- [ ] Audio recording
- [ ] Send to transcription API
- [ ] Display transcript
- [ ] Handle errors/retry

### 8.2 Gemini (AI Generation)
- [ ] SOAP note generation
- [ ] Wellness plan generation
- [ ] Procedure notes generation
- [ ] Clinical summary generation

### 8.3 Resend (Email)
- [ ] Export/share via email

---

## Phase 9: Polish & App Store Prep

### 9.1 UI Polish
- [ ] Loading skeletons
- [ ] Error states
- [ ] Empty states
- [ ] Animations/transitions
- [ ] Haptic feedback

### 9.2 App Store Assets
- [ ] App icon (1024x1024)
- [ ] Splash screen
- [ ] Screenshots for stores
- [ ] App description

### 9.3 Permissions
- [ ] Microphone (voice recording)
- [ ] Camera (patient photos)
- [ ] Notifications

### 9.4 Build & Deploy
- [ ] EAS configuration
- [ ] iOS build
- [ ] Android build
- [ ] App Store submission
- [ ] Play Store submission

---

## Technical Stack

### Frontend (Expo)
- expo-router (file-based routing)
- zustand (state management)
- @tanstack/react-query (data fetching)
- react-native-safe-area-context
- expo-av (audio recording)
- expo-web-browser (OAuth)

### Backend (Supabase - existing)
- Authentication
- Database (PostgreSQL)
- Storage
- Edge Functions (AI processing)

### External APIs
- Eleven Labs (transcription)
- Gemini (AI generation)
- Resend (emails)

---

## Estimated Timeline

| Phase | Description | Est. Time |
|-------|-------------|-----------|
| 1 | Foundation & Auth | ✅ Done |
| 2 | Layout & Navigation | 2-3 hours |
| 3 | Patient Management | 4-5 hours |
| 4 | Consultation Workflow | 8-10 hours |
| 5 | Consults List | 2-3 hours |
| 6 | Additional Features | 4-5 hours |
| 7 | Settings & Account | 2-3 hours |
| 8 | AI Integrations | 4-5 hours |
| 9 | Polish & App Store | 3-4 hours |

**Total Estimated: 30-40 hours**

---

## Files to Port (Priority Order)

### Critical (Must Have)
1. `MobileBottomNav.tsx` → Tab navigation
2. `Dashboard.tsx` → Home screen
3. `Patients.tsx` → Patient list
4. `PatientDetail.tsx` → Patient view
5. `ConsultWorkspace.tsx` → Core consult flow
6. `VoiceRecorder.tsx` → Voice recording
7. `SOAPEditor.tsx` → SOAP editing
8. `QuickConsultDialog.tsx` → Start consult

### Important (Should Have)
9. `Consults.tsx` → Consults list
10. `CaseSummary.tsx` → Summary view
11. `WellnessEditor.tsx` → Wellness plans
12. `ProcedureEditor.tsx` → Procedures
13. `Messages.tsx` → Messaging
14. `Tasks.tsx` → Task management

### Nice to Have
15. `Diagnostics.tsx` → Diagnostic files
16. `Templates.tsx` → Templates
17. `AccountSettings.tsx` → Settings

---

## Notes

1. **No Billing/Payment** - As per user request
2. **No Signup** - Sign-in only
3. **Same Supabase** - Uses existing database
4. **Edge Functions** - Will call existing functions
5. **Mobile Layout** - Copy existing mobile browser design
