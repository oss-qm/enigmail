/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <unistd.h>
#include <sys/resource.h>
#include <stdio.h>

void closeOtherFds(int fdIn, int fdOut, int fdErr) {

  int maxFD = 256; // arbitrary max
  int i;
  struct rlimit rl;

  if (getrlimit(RLIMIT_NOFILE, &rl) == 0) {
      if (rl.rlim_cur <  999999) // ignore too high numbers
        maxFD = rl.rlim_cur;
  }

  /* close any file descriptors */
  /* fd's 0-2 are already closed */
  for (i = 3; i < maxFD; i++) {
    if (i != fdIn && i != fdOut && i != fdErr)
      close(i);
  }
}

pid_t launchProcess(const char *path, char *const argv[], char *const envp[],
                    const char* workdir,
                    const int fd_in[2],
                    const int fd_out[2],
                    const int fd_err[2])
{
  pid_t pid;

  int mergeStderr = (fd_err ? 0 : 1);

  pid = fork();
  if (pid == 0) {
    // child
    if (workdir) {
      if (chdir(workdir) < 0) {
        _exit(126);
      }
    }

    closeOtherFds(fd_in[0], fd_out[1], fd_err ? fd_err[1] : 0);
    close(fd_in[1]);
    close(fd_out[0]);
    if (!mergeStderr)
      close(fd_err[0]);
    close(0);
    dup(fd_in[0]);
    close(1);
    dup(fd_out[1]);
    close(2);

    dup(mergeStderr ? fd_out[1] : fd_err[1]);
    execve(path, argv, envp);
    _exit(1);
  }

  // parent
  return pid;
}
