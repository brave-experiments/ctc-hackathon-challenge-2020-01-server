select execute($$

delete from migrations where id = '0010';

drop table snapshots;

$$) where exists (select * from migrations where id = '0010');

