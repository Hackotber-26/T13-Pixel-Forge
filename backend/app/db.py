from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import settings

pool = ConnectionPool(
    settings.db_dsn,
    min_size=1,
    max_size=5,
    open=False,
    kwargs={"row_factory": dict_row, "prepare_threshold": None},
)


@contextmanager
def tx():
    """One connection + transaction; commits on success, rolls back on error."""
    with pool.connection() as conn:
        yield conn
