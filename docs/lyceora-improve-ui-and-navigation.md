# improve UI and navigation 

As a student, when I enter the web virtual classroom, I want to be able to see my whole journey in the form of a path with milestones.
A menu should display all the phases:
- Subject selection: the student can select a subject to learn (currently only math is available, but others will be added in the future)
- Initial Assessment, that will shape the learning path
- learning path with:
    - topics 
    - lessons
    - exercises
    - Intermediate assessment
- Final assessment
- Certificate

All these phases are supervised by the AI Teacher that can adjust the learning path based on the student progress and performance and interact with the student to help him/her to learn, explaing what he/she doesn't understand and be available to answer questions.

## display learning material 
As a student, I want to be able to see all the learning material that has been suggested for me.
Of course, until the subject is choosen and theintial assessment is completed, there is nothing to see

Based on the assessment, there are topics where the student needs to improve/learn and topics already mastered.
In the learning path, all the topics are presented, but the UI mark as "mastered" the topics where the student doesn't need to improve/learn.
This it to permit to the student to open the topics and lessons even if he/she already mastered them, to refresh the knowledge.
The UI should highlight the topics that need to be learned and should gray out the topics that are mastered.

When a topic is selected, it expands and shows the lessons that are part of the topic
The lessons are presented in a linear order, but the UI allows the student to open them in any order.

The lessons and learning material that have been already seen is marked as viewed, but can be viewed multiple times.-

Our database contains already many lessons and exercises found on the web. Some of the lessons are redundant, so we should highlight the suggested lesson and the other lessons as "alternative" or "additional".

Thank to the voting system (thumb-up, thumb-down) the students can rate the lessons and exercises and this rating should be used to improve the suggested lessons and exercises

The lessons found on the web can be in different languages. A selector in the UI should permit to the student to see only the learning material in his language or select also other languages to display.

## display assessment and exercises results with AI teacher feedback

The student should have access to all the result of all the already taken assessment and exercises he/she has completed, check the outcome with an explanation of the mistakes, a link to a lessons that teach the topic and the possibility to chat with the ai teacher to ask questions about the outcome. 

## Parent view

As a parent I would like to see the same things for each of my children, so I can monitor their progress
