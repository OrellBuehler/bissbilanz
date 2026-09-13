#!/usr/bin/env perl
# Rejects catch blocks that discard the exception: an unnamed binding
# (`catch (_: E)`), or a body that neither touches the caught error nor
# calls anything (so it can't be reporting or rethrowing it — it just
# yields a fallback value or flips a flag). Usage: <files...>
use strict; use warnings;
my $bad = 0;
sub discards {
  my ($v, $body) = @_;
  return 1 if defined $v && $v eq '_';
  $body =~ s{//[^\n]*}{}g; $body =~ s{/\*.*?\*/}{}gs;
  return 0 if defined $v && $body =~ /\b\Q$v\E\b/;
  return $body !~ /\w\s*\(/;
}
for my $f (@ARGV) {
  next if $f =~ m{(^|/)(node_modules|build|\.svelte-kit|paraglide|generated)/} || $f =~ /\.(test|spec)\.[tj]s$|Tests?\.(kt|swift)$|\/test\//;
  open my $fh, '<', $f or next; local $/; my $s = <$fh>; close $fh;
  my @hits;
  if ($f =~ /\.kts?$/) {
    while ($s =~ /catch\s*\(\s*(\w+)\s*:[^)]*\)\s*\{([^{}]*)\}/g) {
      my ($v, $body) = ($1, $2);
      push @hits, pos($s) if discards($v, $body);
    }
  } elsif ($f =~ /\.swift$/) {
    while ($s =~ /\bcatch\b([^{\n]*)\{([^{}]*)\}/g) {
      my ($clause, $body) = ($1, $2);
      my $v = ($clause =~ /let\s+(\w+)/) ? $1 : 'error';
      push @hits, pos($s) if discards($v, $body);
    }
  } elsif ($f =~ /\.(ts|js|svelte)$/) {
    while ($s =~ /\bcatch\s*(?:\(\s*(\w+)\s*(?::[^)]*)?\))?\s*\{([^{}]*)\}/g) {
      my ($v, $body) = ($1, $2);
      push @hits, pos($s) if discards($v, $body);
    }
  }
  for my $p (@hits) {
    my $line = 1 + (substr($s, 0, $p) =~ tr/\n//);
    print "$f:$line: catch discards the exception — report it or rethrow\n"; $bad = 1;
  }
}
exit $bad;
