"""Internal support bot. Run: python agent.py"""
from openai import OpenAI

from prompts import SYSTEM_PROMPT
from tools import TOOLS, dispatch_tool

client = OpenAI()


def run_turn(messages):
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        tools=TOOLS,
    )
    msg = response.choices[0].message
    while msg.tool_calls:
        messages.append(msg)
        for call in msg.tool_calls:
            result = dispatch_tool(call.function.name, call.function.arguments)
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": result,
            })
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOLS,
        )
        msg = response.choices[0].message
    messages.append({"role": "assistant", "content": msg.content})
    return msg.content


def main():
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    print("Support bot ready. Ctrl+C to quit.")
    while True:
        try:
            user = input("you> ").strip()
        except (KeyboardInterrupt, EOFError):
            print()
            break
        if not user:
            continue
        messages.append({"role": "user", "content": user})
        print("bot>", run_turn(messages))


if __name__ == "__main__":
    main()
