-- Msgr's queries are short. Postgres compiles one to machine code (JIT) when
-- it guesses the query is dear, and an unread total over many long chats is
-- guessed so: compiling it takes ~20 ms, the query itself ~5. So the app's
-- own role never compiles. Any role may set its own defaults; each new
-- connection takes it, pooled or not.
ALTER ROLE CURRENT_USER SET jit = off;
