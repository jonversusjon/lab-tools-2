import sys

with open('rules/rules.md', 'r') as f:
    text = f.read()

target_drop = 6888
current_drop = 0
lines = text.split('\n')
new_lines = []

for i in range(len(lines)-1, -1, -1):
    current_drop += len(lines[i]) + 1
    if current_drop >= target_drop:
        new_lines = lines[:i]
        break

with open('rules/rules.md.trimmed', 'w') as f:
    f.write('\n'.join(new_lines))
    if len(new_lines) > 0:
        f.write('\n')

print(f"Original length: {len(text)}, target drop: {target_drop}, actual drop: {current_drop}")
print(f"Remaining lines: {len(new_lines)}")
for i, l in enumerate(new_lines[-5:]):
    print(f"End {i}: {l}")
