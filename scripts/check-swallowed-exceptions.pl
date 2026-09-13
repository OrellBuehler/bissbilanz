#!/usr/bin/env perl
# Rejects catch blocks that discard the exception: an unnamed binding
# (`catch (_: E)`), an empty body, or a body that never touches the caught
# error. Every catch must report or rethrow. Usage: <files...>
use strict; use warnings;
my $bad = 0;
for my $f (@ARGV) {
  next if $f =~ m{(^|/)(node_modules|build|\.svelte-kit|paraglide|generated)/} || $f =~ /\.(test|spec)\.[tj]s$|Tests?\.(kt|swift)$|\/test\//;
  open my $fh, '<', $f or next; local $/; my $s = <$fh>; close $fh;
  my @hits;
  if ($f =~ /\.kts?$/) {
    while ($s =~ /catch\s*\(\s*(\w+)\s*:[^)]*\)\s*\{([^{}]*)\}/g) {
      my ($v, $body) = ($1, $2);
      push @hits, pos($s) if $v eq '_' || $body !~ /\b\Q$v\E\b/;
    }
  } elsif ($f =~ /\.swift$/) {
    while ($s =~ /\bcatch\b([^{\n]*)\{([^{}]*)\}/g) {
      my ($clause, $body) = ($1, $2);
      my $v = ($clause =~ /let\s+(\w+)/) ? $1 : 'error';
      push @hits, pos($s) if $body !~ /\b\Q$v\E\b/;
    }
  } elsif ($f =~ /\.(ts|js|svelte)$/) {
    while ($s =~ /\bcatch\s*(?:\(\s*(\w+)\s*(?::[^)]*)?\))?\s*\{([^{}]*)\}/g) {
      my ($v, $body) = ($1, $2);
      push @hits, pos($s) if !defined $v || $body !~ /\b\Q$v\E\b/;
    }
  }
  for my $p (@hits) {
    my $line = 1 + (substr($s, 0, $p) =~ tr/\n//);
    print "$f:$line: catch discards the exception — report it or rethrow\n"; $bad = 1;
  }
}
exit $bad;
