# Prompt Log

All code drafted and written by AI within the codebase has been commented on to acknowledge this fact. GPT 5.3 Codex was primarily used for coding purposes.

## 1. Run Workflow And Terminal Setup

- "can you make anything for the terminal run through the batch file ... automatically open in the browser ... replace colons with hyphens"
- "can you go through and on any code that you wrote, can you write a quick comment ... more personalized ... don’t comment everything ... more on styling and frontend structuring"

## 2. Frontend Cleanup And Naming

- "delete any empty folders or files"
- "consolidate folders/files that should be combined, such as __tests__ and test in frontend"
- "rename mapnavigation to indoornavigation and outdoormap to outdoornavigation"
- "any names that don't make logical sense, let me know and update them"

## 3. Vercel Deployment And Runtime

- "can you help me set things up for deployment"
- "is there a certain command that I need to tell vercel to run or something? I already added them, but code changes?"
- "can you also add it so it will log if the backend is running"
- "did you remove the sample building data that was already there? can you just remove the data that was in the frontend and not remove all the sample data? that was probably fine. the entire campus is not necessary since the backend logic other than mapbox is just for the inside of a building."

## 4. Frontend Logic Extraction

- "can you search through the frontend directory and remove any backend logic. I only want frontend logic that will be sourced from the backend, let me know what changes you make. we want to develop routes in order to enable point to point navigation within a hospital building, umass memorial worcester massachusetts 55 lake ave"
- "fantastic, can you go through the server.js file and see what functions on the backend correlate in logic to the ones that were on the frontend and create the proper endpoints. can you also move all the frontend api calls to a utils file"
- "can you go through the frontend and backend and remove any comments that looked ai generated. make the code look a bit more readable. also, I don't want building data in the frontend"
- "okay never mind just generate the chat prompts md, nothing else"
- "and do a fuller chronology"