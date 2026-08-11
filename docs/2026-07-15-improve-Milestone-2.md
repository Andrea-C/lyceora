# 2026-07-15 improve Milestone 2

Let's make the app more usable from a human perspective
In this context we consider all types of users:
- Administrator
- Parents
- Students
- other possible roles (to be defined)

So, let's add a navigation menu to the app that allows me to direct access all the features of the app
I would also be able to access to a dashboard where I can see all the users and student profile to understand what they did, and which stage of the app they reached

## Roles, Authorization, feature visibility

The first goal is to test the app prototype that is in ongoing development
As a product manager, I want to see all the features of the app and how they work together

Before acting, let's discuss the role authorization side and which menu items should be available to different type of user

We have some options here
1. At this prototype stage, every user can access everything
2. Alredy add the possibility to define roles and show features base on the user role. In this case, as a product manager, I would like to impersonate different roles to test all the features

## other notes
Just for context, I leave here your latest answer to my previous question:
<User_question>
❯ I would like to try the app as a student
  I've logged in and I'm redirected to the "Who's studying today?" page
  I enter name and birth year and save the profile
  but the page doesn't change. I'm still in the same form, asking me to add a profile
  Do the app have a navigation menu?
  How can I progress the app and test it in every aspect?
</User_question>
<Assistant_answer>
Found it — read the current profiles page and there are two things going on, one of which is almost certainly your blocker.

Why the page "doesn't change"

Most likely: the birth-year field silently rejects your value. The form only accepts birth years 2005–2022 (profiles/page.tsx:28,130-131). If you entered your own birth year to try it as yourself-the-student, the browser blocks the submit with a small native tooltip that's very easy to miss — the page then genuinely does nothing. Two ways to unblock immediately:

- enter any year between 2005 and 2022 (it only labels the profile — exercises target topic age ranges, not profile age), or
- leave birth year empty (it's optional; only a filled-in out-of-range value blocks).

Second quirk, by design but unlabeled: after a successful save the page intentionally stays on "Chi studia oggi?" — the new child appears as a clickable name card above the form (so parents can add more kids). Clicking the name card is what enters the app. Also note: your account already has the "Test Studente" profile from our July 12 smoke run — you can click that card right now and skip creation entirely.

Does the app have a navigation menu?

No — there is no nav bar yet (deliberately minimal M1 UI, and a known gap now worth fixing). The full map, navigated by URL:

┌────────────────┬────────────────────┬────────────────────────────────────────────────────────┐
│      Page      │        URL         │               How you normally reach it                │
├────────────────┼────────────────────┼────────────────────────────────────────────────────────┤
│ Profile picker │ /it/app/profiles   │ after login, or when no profile selected               │
├────────────────┼────────────────────┼────────────────────────────────────────────────────────┤
│ Student home   │ /it/app            │ after clicking a profile card                          │
├────────────────┼────────────────────┼────────────────────────────────────────────────────────┤
│ Diagnostic     │ /it/app/diagnostic │ auto-offered on first entry ("Scopri da dove partire") │
├────────────────┼────────────────────┼────────────────────────────────────────────────────────┤
│ Session        │ /it/app/session    │ "Inizia la sessione" on home                           │
├────────────────┼────────────────────┼────────────────────────────────────────────────────────┤
│ Parent area    │ /it/app/parent     │ URL only — no link exists                              │
├────────────────┼────────────────────┼────────────────────────────────────────────────────────┤
│ Language       │ EN/IT toggle       │ top-right on every page                                │
└────────────────┴────────────────────┴────────────────────────────────────────────────────────┘

There's also no logout or profile-switch link — clear the lyceora_profile cookie or use the URL to get back to /it/app/profiles.

Testing the app in every aspect — a walkthrough

1. Profile & settings: click a profile card; on the same page, try the "Obiettivo XP giornaliero" field per child (bounds 10–200) — new in M2.
2. Diagnostic (first entry): 12–20 adaptive questions. Deliberately miss a few — wrong answers propagate downward and shape the plan (that's the false-mastery detection working).
3. Home: XP bar vs your goal, streak flame, per-domain progress bars, and the badge case — "Primi passi" should be earned and full-color after the diagnostic; the other 9 badges show muted.
4. Session: lessons (some have curated videos; many topics show the "no video yet" state), "Chiedi al maestro" — ask it to just give you the answer and watch it refuse Socratically; it's rate-limited to 30 messages/hour. Exercises grade with warm feedback, XP increments, badge toasts pop bottom-right.
5. Adaptive routing: fail an assessment on purpose → you get remediation on the specific weak prerequisite rather than "wrong, try again".
6. Spaced repetition: come back tomorrow — streak ticks up, and due reviews get interleaved into the session (M2 made the intervals smarter: passing streaks skip rungs; day-to-day practice silently renews prerequisite reviews).
7. Parent view: /it/app/parent — domain bars, 14-day activity chart, weekly summary, "Da rivedere insieme" list, recent badges.
8. Bilingual: flip EN anywhere — content, exercises, and the teacher all switch.
9. Fresh start: create a second profile — every profile is an independent student.

Want me to fix the rough edges you just hit?

The silent birth-year rejection, the missing "click your child's name to start" hint, and the absent navigation (parent link, logout, profile switch) are all small, high-value fixes — they're exactly what a first real tester should surface. Say the word and I'll ship them as an M2.1 patch; otherwise they go on the backlog as documented.
</Assistant_answer>

## tasks
- discuss the Role and authorization system for the current prototype
- fix the issues already mentioned
- develop the navigation menu 
- develop the dashboard for product manager / administrator view
