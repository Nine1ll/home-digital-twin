"""Additive upgrade for existing SQLite/PostgreSQL installations. Run once before workers."""

from sqlalchemy import inspect, text


def upgrade(engine):
    additions = {
        "users": {"display_name": "VARCHAR(50) NOT NULL DEFAULT '가족'"},
        "products": {"consumption_mode": "VARCHAR(20) NOT NULL DEFAULT 'count'"},
        "batches": {
            "remaining_level": "VARCHAR(20) NOT NULL DEFAULT 'closed'",
            "opened_at": "VARCHAR(40) NOT NULL DEFAULT ''",
        },
    }
    with engine.begin() as connection:
        if connection.dialect.name == "postgresql":
            connection.execute(text("SELECT pg_advisory_xact_lock(72819401)"))
        elif connection.dialect.name == "sqlite":
            connection.exec_driver_sql("BEGIN IMMEDIATE")
        inspector = inspect(connection)
        for table, columns in additions.items():
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, definition in columns.items():
                if name not in existing:
                    connection.execute(
                        text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
                    )
