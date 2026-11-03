# Records .github/assets/install.gif: the curl installer on a fresh Linux machine with no Node, then
# init, serve, and a first message in the TUI. The machine is a throwaway container (`--rm`) built from:
#
#   FROM debian:trixie-slim
#   RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends curl ca-certificates
#   RUN useradd -m you
#   USER you
#   WORKDIR /home/you
#
#   docker build -t dispach-install-demo .   then   vhs .github/assets/install.tape
#
# Reads MODEL_API_KEY from ./.env in hidden setup and passes it into the container as $KEY; the key is
# never typed or printed on screen. init takes no secret as an argument, so the one visible key step
# writes $KEY into the agent's .env.

Output .github/assets/install.gif
Set Shell "bash"
Set FontSize 14
Set Width 1200
Set Height 700
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 18ms
Set WaitPattern /^\$\s*$/
Set WaitTimeout 120s

Hide
Type `set -a; . ./.env; set +a; export KEY=$MODEL_API_KEY; docker rm -f install-demo >/dev/null 2>&1; docker run --rm -it -e KEY -e DISPACH_NO_BOOTSTRAP=1 -e 'PS1=$ ' -e LANG=C.UTF-8 --name install-demo dispach-install-demo bash --norc` Enter
Wait
Type "clear" Enter
Wait
Show

Type "curl -fsSL https://github.com/moeen-mahmud/dispach/releases/latest/download/install.sh | sh" Enter
Wait
Type `export PATH="$HOME/.dispach/bin:$PATH"; dispach --version` Enter
Wait
Sleep 1s
Type "dispach init --yes --user you --name milo --preset deepseek --model deepseek-v4-flash --daemon none" Enter
Wait
Sleep 2s
Type "# the key goes in the agent's .env, never on the command line (here it comes from $KEY)" Enter
Type `sed -i "s/^MODEL_API_KEY=$/MODEL_API_KEY=$KEY/" ~/.dispach/agents/milo/.env` Enter
Wait
Type "dispach serve & sleep 3" Enter
Wait
Type "curl -s localhost:7420/v1/ready; echo" Enter
Wait
Sleep 1s
Type "dispach run milo" Enter
Sleep 3s
Type "Say hello and name one thing you can do, in one sentence."
Sleep 500ms
Enter
Sleep 10s

Hide
Ctrl+C
Ctrl+C
Sleep 1s
Type "exit" Enter
Sleep 2s
