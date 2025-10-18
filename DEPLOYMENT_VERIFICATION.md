# Deployment Verification Guide

## Issue Summary
Cron jobs execute once, then stop completely due to invalid `noOverlap: true` option in node-cron.

## Deploy the Fix

### On Server:
```bash
# 1. Stop the application
pm2 stop all

# 2. Pull latest changes
cd /path/to/services
git pull origin deployment

# 3. Verify you have the latest commit
git log --oneline -2
# Should show:
# 96a23e1 Fix cron jobs not executing - remove invalid noOverlap option
# 60972b2 Fix critical worker process issues causing EBS health failures

# 4. Start the application
pm2 start all

# 5. Wait 10 seconds for workers to initialize
sleep 10
```

## Verification Steps

### 1. Check Worker Initialization (First 30 seconds)
```bash
pm2 logs --lines 50 | grep "Cron job registered"
```

**Expected Output (you should see these lines):**
```
[LOTTERY-WORKER] Cron job registered: check-and-publish-results with schedule */5 * * * *
[LOTTERY-WORKER] Cron job registered: analyze-and-create-missing-lotteries with schedule */10 * * * *
[LOYALTY-WORKER] Cron job registered: process-no-win-cashback with schedule 0 1 * * *
[LOYALTY-WORKER] Cron job registered: reset-monthly-referral-caps with schedule 0 0 1 * *
[DOMINO-WORKER] Cron job registered: fill-virtual-rooms-with-bots with schedule */3 * * * * *
[DOMINO-WORKER] Cron job registered: handle-human-timeouts with schedule */10 * * * * *
... (more cron jobs)
```

❌ **If you DON'T see these:** Workers failed to initialize cron jobs - check error logs

### 2. Check Lottery Cron Execution (Wait 5 minutes)
```bash
# Watch logs in real-time
pm2 logs | grep -E "Checking and publishing|Analyzing and creating"
```

**Expected Output (every 5-10 minutes):**
```
Oct 18 04:00:00 - Checking and publishing lottery results
Oct 18 04:00:00 - Query: { status: {...}, scheduledTime: {...} }
Oct 18 04:00:00 - Lotteries: <number>

Oct 18 04:05:00 - Checking and publishing lottery results  # Next cycle
Oct 18 04:05:00 - Query: { status: {...}, scheduledTime: {...} }
Oct 18 04:05:00 - Lotteries: <number>

Oct 18 04:10:00 - Analyzing and creating missing lotteries  # Every 10 min
```

✅ **GOOD:** Cron jobs executing on schedule
❌ **BAD:** No logs after initial execution = issue persists

### 3. Check Memory Monitoring (Every 5 minutes)
```bash
pm2 logs | grep "Memory:"
```

**Expected Output:**
```
[LOTTERY-WORKER] [2025-10-18T04:00:37.828Z] Memory: RSS=129MB, Heap=51/55MB
[LOYALTY-WORKER] [2025-10-18T04:00:37.641Z] Memory: RSS=122MB, Heap=45/49MB
[DOMINO-WORKER] [2025-10-18T04:00:38.407Z] Memory: RSS=140MB, Heap=51/57MB
```

### 4. Verify No Duplicate Executions
```bash
# Run for 10 minutes and count lottery checks
pm2 logs --lines 200 | grep "Checking and publishing" | wc -l
```

**Expected:** 2 executions in 10 minutes (at minute 0 and minute 5)
❌ **If 4:** Duplicate execution issue still exists (shouldn't happen)

### 5. Check for Errors
```bash
pm2 logs | grep -i "error"
```

**Expected:** Minimal errors, no recurring error patterns
❌ **If many errors:** Investigate specific error messages

### 6. EBS Health Check (Wait 5-10 minutes)
- Check AWS EBS Console
- Instance health should be **GREEN**
- If RED, check what health check is failing

## Success Criteria

| Check | Status | Expected |
|-------|--------|----------|
| Cron jobs registered at startup | ✅ | See registration logs for all workers |
| Lottery check runs every 5 min | ✅ | Consistent execution logs |
| No duplicate execution | ✅ | Single execution per schedule |
| Memory usage stable | ✅ | ~120-140MB per worker |
| No recurring errors | ✅ | Clean logs |
| EBS health GREEN | ✅ | Within 5-10 minutes |

## Troubleshooting

### Problem: No "Cron job registered" logs
**Cause:** Workers failed to initialize
**Solution:**
```bash
pm2 logs --err --lines 100  # Check error logs
pm2 restart all  # Try restarting
```

### Problem: Cron jobs registered but not executing
**Cause:** Cron scheduler or job function failing
**Solution:**
```bash
# Check for errors in worker logs
pm2 logs | grep "ERROR"

# Check database connection
pm2 logs | grep "MongoDB"
```

### Problem: Executions stop after first run
**Cause:** Error in job causing scheduler to stop
**Solution:**
```bash
# Look for errors right after last successful execution
pm2 logs --lines 500 | grep -A 10 "Checking and publishing"
```

### Problem: Duplicate executions still happening
**Cause:** Old code still running
**Solution:**
```bash
# Verify git commit
git log --oneline -1  # Should be 96a23e1

# Force full restart
pm2 delete all
pm2 start ecosystem.config.js  # Or however you start it
```

## Quick Test Commands

### Test 1: Watch for 10 minutes
```bash
timeout 600 pm2 logs | tee /tmp/worker-test.log
# After 10 minutes, analyze:
grep "Checking and publishing" /tmp/worker-test.log | wc -l
# Should be 2 (at minute 0, 5)
```

### Test 2: Monitor worker health
```bash
watch -n 30 'pm2 list && echo "---" && pm2 logs --lines 5 --nostream'
```

### Test 3: Track cron execution times
```bash
pm2 logs | grep "Checking and publishing" | awk '{print $1, $2}'
# Look for regular 5-minute intervals
```

## Rollback Plan

If issues persist:
```bash
git log --oneline -5  # Find previous commit
git revert HEAD  # Or specify commit hash
git push origin deployment
pm2 restart all
```

## Post-Deployment Monitoring (First 24 Hours)

Monitor these every few hours:
- [ ] Cron jobs executing on schedule
- [ ] Memory usage stays under 200MB per worker
- [ ] No worker restarts
- [ ] EBS health remains GREEN
- [ ] Database connection stable
- [ ] No error spikes in logs

---

**Last Updated:** 2025-10-18
**Deployment Priority:** 🔥 CRITICAL
**Estimated Fix Time:** < 2 minutes after deployment

