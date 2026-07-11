# Design a learning app

## App general flow
The app should have all the needed content:
1. Learning path selection
2. AI teacher guidance. AI agents that: 
    - teach the student
    - answer student questions to help him/her to learn
2. pre-assessment to define the student starting point and suggested path
3. lesson content
4. exercises
5. intermediate assessment
6. route to next step: can be the next subject/topic in the learning path or repeat the previous one if the evaluation show that some skill are still missing
7. gamified
8. Assign badges and certificate the student level

## Other features

- The app can use learning content found on the Internet, like videos for the lessons
- The content should be in multi-language, starting with Italian and English
- The app build process should then consider to search the internet to collect the needed leaning material
- The app should be extensible: new learning path can be added in the future, using the app harnesses
- The AI agents/teacher must auto improve, based on the interaction with the students, so it will create its memories to improve its behavior
- The AI agents can generate Images, video with audio and music to enhance the content of the lessons. This feature is available at level of lesson building
- The AI agents can use the [AG-UI](https://github.com/ag-ui-protocol/ag-ui) protocol to generate needed content on the fly
- The AI agents must be model agnostic, being able to use model from different providers, like Anthropic, OpenAI, Google, OpenRouter and local models
- The AI agents model must be configurable to assign to each agent/subagent the right model, to use the most powerful model for the task where high reasoning is requested and the cheapest model to the less intesive tasks
- You can inspire to project like:
    - https://github.com/nousresearch/hermes-agent
    - https://github.com/openclaw/openclaw
- We can improve the capabilities of the agents with:
    - tools that we can design and build
    - MCP servers 
    - Skills

The skills can be built during the platform building or selected from the one already available in the internet, i.e.:
 - https://github.com/anthropics/skills
 - https://github.com/NousResearch/hermes-agent/tree/main/skills
 - https://github.com/openclaw/openclaw/tree/main/skills
 - https://github.com/davidondrej/skills
 - 

## Auto improve agents
The agent should have the capability to auto improve, base on the interaction with the students, understanding what works and what doesn't work
Improvement can be done on many sides
- better interaction with users
- optimizing the learning path
- every agentic part that can be improved

To develop an auto-improve agent you can use the skill "self-improving-agents"


## Learning path and examples

To start with a first prototype we will check the project https://withmarble.com
and its related GitHub repository https://github.com/withmarbleapp/os-taxonomy

Check also the similar project: https://mathacademy.com

## Pedagogy principles
The platform must organize it's way or working base on the best and modern researches and principles in pedagogy, psicology and learning theories, to maximize the learning of the students


Can you design an app, similar to mathacademy, using the os-taxonomy repository?

claude --resume baad2a35-22da-41df-93e5-d3dea2937999
