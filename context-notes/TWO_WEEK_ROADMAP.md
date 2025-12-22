# Hypertrophy Tracker – Two-Week Roadmap to Polished Product

**Goal:** Transform the current MVP into a polished, production-ready hypertrophy tracking app with intelligent progression, comprehensive analytics, and refined UX.

**Current State:** Basic workout logging, SQLite foundation, settings screen, simple history.

---

## Week 1: Core Features & Intelligence

### Day 1 (Dec 11) – Exercise Management & UI Polish
**Focus:** Exercise CRUD + Initial UX improvements

**Tasks:**
- [ ] Create "Manage Exercises" screen in `/app/exercises.tsx`
- [ ] Add exercise picker with search & muscle group filtering to log screen
- [ ] Implement add/edit/delete exercise functionality
- [ ] Add muscle group tags to exercise list
- [ ] Update exercise picker UI (group by muscle, scrollable chips)
- [ ] Add validation for exercise names

**Deliverables:**
- Users can add custom exercises
- Exercise picker is searchable and grouped
- Clean, intuitive exercise selection flow

---

### Day 2 (Dec 12) – RPE & Warmup Integration ✅
**Focus:** Complete the logging UX with all schema fields

**Tasks:**
- [x] Add RPE slider/picker to log screen
- [x] Add warmup set toggle to log screen
- [x] Update `addSet` calls to include RPE and warmup flags
- [x] Add visual distinction for warmup vs working sets in logged sets list
- [x] Add set notes functionality (quick notes per set)
- [x] Improve set display with better formatting (bold weight, color-coded RPE)

**Deliverables:**
- Full logging capability (reps, weight, RPE, warmup)
- Clear visual feedback for different set types
- Per-set notes support

---

### Day 3 (Dec 13) – Progression Engine Foundation
**Focus:** Build the intelligence layer

**Tasks:**
- [ ] Create `/lib/progression.ts` module
- [ ] Implement function to get last workout for an exercise
- [ ] Implement weight suggestion algorithm:
  - If last RPE ≥ 9 → suggest same weight
  - If last RPE ≤ 7 → suggest +2.5-5% increase
  - If missed reps → suggest -5% decrease
- [ ] Store derived metrics (volume = sets × reps × weight)
- [ ] Add `getSuggestedWeight(exerciseId)` function
- [ ] Integrate weight suggestions into log screen

**Deliverables:**
- Intelligent weight suggestions based on previous performance
- Progression logic foundation in place
- Auto-populated weight field with suggested values

---

### Day 4 (Dec 14) – Analytics Foundation
**Focus:** Data aggregation for insights

**Tasks:**
- [ ] Create analytics queries in `/lib/analytics.ts`:
  - Weekly volume per muscle group
  - Exercise progression history
  - Personal records (PRs)
  - Total tonnage per workout
- [ ] Add indexes to database for performance
- [ ] Create data structures for chart rendering
- [ ] Test query performance with mock data

**Deliverables:**
- Analytics data layer ready
- Efficient queries for progress tracking
- Foundation for charts and insights

---

### Day 5 (Dec 15) – Workout Detail Screen
**Focus:** Rich history view

**Tasks:**
- [ ] Create `/app/workout/[id].tsx` detail screen
- [ ] Make history items tappable (link to detail)
- [ ] Display all sets with exercise names, reps, weight, RPE
- [ ] Show workout summary (total volume, duration, exercises)
- [ ] Add workout notes section
- [ ] Implement delete workout functionality
- [ ] Add ability to duplicate/repeat a workout

**Deliverables:**
- Detailed workout view with all sets
- Workout management (view, delete, duplicate)
- Enhanced history screen with navigation

---

### Day 6 (Dec 16) – Exercise Detail & History
**Focus:** Per-exercise insights

**Tasks:**
- [ ] Create `/app/exercise/[id].tsx` detail screen
- [ ] Show exercise history (all sets across all workouts)
- [ ] Display personal records (heaviest weight, most reps, highest volume)
- [ ] Show last 5 workouts for this exercise
- [ ] Add edit/delete exercise from detail view
- [ ] Calculate estimated 1RM for each working set
- [ ] Add "best sets" section (top 5 by weight × reps)

**Deliverables:**
- Comprehensive exercise history
- PR tracking per exercise
- Easy access to exercise performance data

---

### Day 7 (Dec 17) – Progress Charts & Visualization
**Focus:** Visual analytics

**Tasks:**
- [ ] Install charting library (`react-native-chart-kit` or `victory-native`)
- [ ] Create `/app/progress.tsx` tab
- [ ] Implement line chart for weight progression (per exercise)
- [ ] Implement bar chart for weekly volume (per muscle group)
- [ ] Add date range selector (4 weeks, 12 weeks, all time)
- [ ] Create PR highlight cards
- [ ] Add consistency streak tracker
- [ ] Implement exercise selector for detailed chart view

**Deliverables:**
- Visual progress tracking
- Weekly volume charts
- Exercise-specific progression charts
- PR highlights and streaks

---

## Week 2: Polish, Testing & Advanced Features

### Day 8 (Dec 18) – Rest Timer Feature
**Focus:** Enhance workout flow

**Tasks:**
- [ ] Create `/components/RestTimer.tsx` component
- [ ] Implement countdown timer (customizable duration)
- [ ] Add timer notifications/alerts when rest is complete
- [ ] Auto-start timer after completing a set (if enabled in settings)
- [ ] Add pause/resume/skip functionality
- [ ] Integrate timer into log screen UI
- [ ] Add timer presets in settings (60s, 90s, 120s, 180s)

**Deliverables:**
- Functional rest timer
- Auto-start based on settings
- Customizable rest periods

---

### Day 9 (Dec 19) – Plate Calculator
**Focus:** Practical utility feature

**Tasks:**
- [ ] Create `/components/PlateCalculator.tsx`
- [ ] Implement plate breakdown algorithm (45lb bar, standard plates)
- [ ] Add barbell weight setting (45lb, 35lb, 20kg bar options)
- [ ] Display plate loading per side
- [ ] Add quick reference modal/sheet on log screen
- [ ] Support kg and lb calculations
- [ ] Add available plates customization in settings

**Deliverables:**
- Plate calculator showing exact loading
- Support for different bar weights
- Easy access during workout logging

---

### Day 10 (Dec 20) – Theme & Visual Polish
**Focus:** UI/UX refinement

**Tasks:**
- [ ] Implement dark/light theme toggle in settings
- [ ] Create consistent color palette and design tokens
- [ ] Refine typography (headings, body, labels)
- [ ] Add proper spacing and padding throughout
- [ ] Create reusable UI components (`Button`, `Card`, `Input`)
- [ ] Add icons using `@expo/vector-icons`
- [ ] Improve navigation bar styling
- [ ] Add loading states and skeleton screens

**Deliverables:**
- Polished, consistent UI throughout app
- Dark/light theme support
- Professional visual design

---

### Day 11 (Dec 21) – Navigation & UX Flow
**Focus:** User experience optimization

**Tasks:**
- [ ] Refine tab navigation labels and icons
- [ ] Add swipe gestures where appropriate
- [ ] Implement confirmation dialogs for destructive actions
- [ ] Add haptic feedback for button presses
- [ ] Create onboarding screen for first-time users
- [ ] Add empty states for all screens
- [ ] Implement pull-to-refresh consistently
- [ ] Add keyboard-aware scroll views

**Deliverables:**
- Smooth, intuitive navigation
- Proper feedback for user actions
- First-time user experience
- Polished interaction patterns

---

### Day 12 (Dec 22) – Data Safety & Backup
**Focus:** Data integrity and export

**Tasks:**
- [ ] Implement WAL checkpointing for SQLite
- [ ] Create backup/export functionality (JSON export)
- [ ] Add import from backup feature
- [ ] Implement data validation and error recovery
- [ ] Add database integrity checks on startup
- [ ] Create debug screen (database stats, clear data option)
- [ ] Add confirmation before data deletion
- [ ] Test database migrations and rollback

**Deliverables:**
- Reliable data persistence
- Export/import functionality
- Data safety measures

---

### Day 13 (Dec 23) – Testing & Bug Fixes
**Focus:** Quality assurance

**Tasks:**
- [ ] Test all user flows end-to-end
- [ ] Fix navigation bugs
- [ ] Test edge cases (empty states, large datasets)
- [ ] Verify calculations (volume, suggestions, PRs)
- [ ] Test settings persistence
- [ ] Verify theme switching
- [ ] Test on different screen sizes
- [ ] Performance testing with large datasets
- [ ] Memory leak detection

**Deliverables:**
- Stable, bug-free core features
- Verified calculations and data integrity
- Performance optimization

---

### Day 14 (Dec 24) – Final Polish & Documentation
**Focus:** Production readiness

**Tasks:**
- [ ] Update README with proper project description
- [ ] Add app screenshots
- [ ] Write user guide/help section in-app
- [ ] Final UI tweaks and polish
- [ ] Add app icon and splash screen
- [ ] Configure app.json with proper metadata
- [ ] Add privacy/terms placeholders if needed
- [ ] Create release notes
- [ ] Final testing on iOS and Android
- [ ] Prepare for app store submission (if applicable)

**Deliverables:**
- Production-ready app
- Complete documentation
- App store assets ready
- Release package prepared

---

## Success Criteria

By the end of two weeks, the app should have:

✅ **Core Features:**
- Complete workout logging with RPE, warmup tracking
- Exercise management (CRUD)
- Intelligent weight suggestions based on progression
- Detailed workout and exercise history
- Visual progress charts

✅ **Utility Features:**
- Rest timer with auto-start
- Plate calculator
- Export/import data

✅ **Polish:**
- Dark/light theme
- Consistent, professional UI
- Smooth navigation and UX
- Proper error handling
- Data safety measures

✅ **Documentation:**
- User guide
- README
- Release notes

---

## Daily Workflow Recommendations

1. **Start each day:** Review previous day's work, test features
2. **Development:** Focus on tasks in order, commit frequently
3. **End of day:** Test new features, document any blockers
4. **Communication:** Update progress, flag issues early

## Flexibility Notes

- If a feature takes longer than expected, move non-critical items to backlog
- Priority order: Core features > Polish > Nice-to-haves
- Keep Week 1 focused on functionality, Week 2 on polish and stability
- Test continuously, don't wait until Day 13

---

**Let's build an amazing hypertrophy tracker! 💪**
