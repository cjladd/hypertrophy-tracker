# Hypertrophy Tracker – Development Plan

This roadmap reflects where the repository currently is and outlines a clear, achievable sequence of steps to reach the final vision.

---

## Phase 1 — Core Logging Foundation (Current → Near Term)
### ✅ Already Implemented
- Basic workout logging (start workout, add sets)  
- SQLite schema for exercises, workouts, sets, notes  
- Seeded exercises  
- Simple history screen  

### 📌 Next Steps
1. **Add RPE & Warmup UI**
   - UI already supports schema fields; expose them in the log screen.

2. **Exercise Picker Improvements**
   - Group by muscle group  
   - Add search  
   - Mark custom exercises  

3. **Add Ability to Add/Edit/Delete Exercises**
   - New screen: "Manage Exercises"
   - CRUD operations  
   - Validate names and muscle group tags  

---

## Phase 2 — Hypertrophy Progression Engine
4. **Define Progression Rules**
   - E.g., repeat weight if RPE ≥ 9  
   - Increase 2.5–5% if last week was easy  
   - Reset after missed reps  

5. **Store Derived Metrics**
   - Volume (sets × reps × weight)  
   - Top set intensity  
   - Weekly set count per muscle group  

6. **In-Session Weight Suggestions**
   - When selecting an exercise, suggest:
     - Expected working weight  
     - Warmup scheme  
     - Number of sets  

---

## Phase 3 — Progression & Analytics Screens
7. **Progress Charts**
   - Line charts for weight progression  
   - Bar charts for weekly volume  
   - PR highlights  

8. **Workout Detail Screen**
   - Tapping a workout in history opens:
     - All sets  
     - Notes  
     - Performance summary  

9. **Exercise Detail Screen**
   - Historical progression  
   - Best sets  
   - Volume trends  

---

## Phase 4 — App Structure & UX Polishing
10. **Settings Tab**
    - Units (kg/lb)  
    - Default split days  
    - Progression preferences  
    - Backup/export  

11. **Visual Polish**
    - Better theming (dark/light)  
    - Cleaner buttons & inputs  
    - Improved navigation  

12. **Data Safety**
    - Add WAL checkpointing  
    - Automatic backups  
    - Option for cloud sync (Expo + Supabase or Firebase)  

---

## Phase 5 — Long‑Term Enhancements
13. **Programs Feature**
    - Build custom training cycles  
    - AI‑generated hypertrophy blocks based on history  

14. **Voice Logging**
    - “Set complete: 10 reps at 80kg”  

15. **Wearable Tracking Integration**
    - Apple Health / Google Fit rep counting (future stretch)  

---

## Summary Roadmap
1. Flesh out logging →  
2. Add hypertrophy logic →  
3. Add analytics →  
4. Polish UX + settings →  
5. Enhance with smart/AI features  

This roadmap ensures steady, achievable progress toward a polished, intelligent hypertrophy‑focused workout app.
