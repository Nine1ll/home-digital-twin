def valid_gtin(code):
    if not code.isascii() or not code.isdigit() or len(code) not in (8, 12, 13, 14):
        return False
    total = sum(
        int(n) * (3 if i % 2 == 0 else 1) for i, n in enumerate(reversed(code[:-1]))
    )
    return (10 - total % 10) % 10 == int(code[-1])
