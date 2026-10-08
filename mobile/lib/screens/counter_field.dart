import 'package:flutter/material.dart';

/// Contador entero con botones grandes (pensado para usar con una mano en la calle).
class CounterField extends StatelessWidget {
  const CounterField({super.key, required this.label, required this.value, required this.onChanged, this.max, this.hint});
  final String label;
  final int value;
  final int? max;
  final String? hint;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label),
          if (hint != null) Text(hint!, style: Theme.of(context).textTheme.bodySmall),
        ]),
      ),
      IconButton.outlined(tooltip: 'Menos', onPressed: value > 0 ? () => onChanged(value - 1) : null, icon: const Icon(Icons.remove)),
      SizedBox(width: 44, child: Text('$value', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge)),
      IconButton.outlined(tooltip: 'Más', onPressed: max == null || value < max! ? () => onChanged(value + 1) : null, icon: const Icon(Icons.add)),
    ]);
  }
}
